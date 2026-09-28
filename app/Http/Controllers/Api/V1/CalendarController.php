<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{CalendarEvent, PurchaseOrder, ReplenishmentRequest, User};
use App\Support\ApiResponse;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class CalendarController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $user = $request->user();
        $from = Carbon::parse($data['from'])->startOfDay();
        $to = Carbon::parse($data['to'])->endOfDay();

        $events = $this->meetingEvents($user, $from, $to)
            ->concat($this->procurementEvents($user, $from, $to))
            ->sortBy('startsAt')
            ->values();

        $upcomingFrom = now()->startOfDay();
        $upcomingTo = now()->addMonths(6)->endOfDay();
        $upcoming = $this->meetingEvents($user, $upcomingFrom, $upcomingTo)
            ->concat($this->procurementEvents($user, $upcomingFrom, $upcomingTo))
            ->sortBy('startsAt')
            ->take(8)
            ->values();

        return ApiResponse::success(['events' => $events, 'upcoming' => $upcoming]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['meeting'])],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'all_day' => ['boolean'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        return ApiResponse::success($this->payload(CalendarEvent::create([
            ...$data,
            'organization_id' => $request->user()->organization_id,
            'created_by' => $request->user()->id,
        ])), 201);
    }

    private function meetingEvents(User $user, Carbon $from, Carbon $to): Collection
    {
        return CalendarEvent::query()
            ->where('organization_id', $user->organization_id)
            ->where('type', 'meeting')
            ->whereBetween('starts_at', [$from, $to])
            ->orderBy('starts_at')
            ->get()
            ->map(fn (CalendarEvent $event) => $this->payload($event));
    }

    private function procurementEvents(User $user, Carbon $from, Carbon $to): Collection
    {
        $role = $user->primaryRole() ?? 'store_keeper';
        $orders = PurchaseOrder::query()
            ->where('organization_id', $user->organization_id)
            ->with(['supplier:id,name', 'warehouse:id,name', 'store:id,name'])
            ->where(function ($query) use ($from, $to): void {
                $query->whereBetween('created_at', [$from, $to])
                    ->orWhereBetween('expected_date', [$from->toDateString(), $to->toDateString()]);
            });

        if ($role === 'supplier') {
            $orders->where('supplier_id', $user->supplier_id ?? 0);
        } elseif ($role === 'department_manager') {
            $orders->where('department_id', $user->department_id ?? 0);
        } elseif (! in_array($role, ['super_admin', 'procurement_manager', 'procurement_officer', 'accountant', 'store_keeper'], true)) {
            return collect();
        }

        $events = collect();
        foreach ($orders->latest()->limit(100)->get() as $order) {
            $location = $order->warehouse?->name ?? $order->store?->name;
            $supplier = $order->supplier?->name;
            $reference = $order->po_number;

            if ($order->created_at && $order->created_at->betweenIncluded($from, $to)) {
                if ($order->status === 'draft' && in_array($role, ['super_admin', 'procurement_manager'], true)) {
                    $events->push($this->generatedPayload(
                        'po-approval-'.$order->id,
                        'Approval required · '.$reference,
                        'approval',
                        $order->created_at,
                        $supplier ? 'Supplier: '.$supplier : null,
                    ));
                } elseif ($order->status === 'sent' && $role === 'supplier') {
                    $events->push($this->generatedPayload(
                        'po-response-'.$order->id,
                        'Supplier response · '.$reference,
                        'purchase_order',
                        $order->created_at,
                        'Confirm or respond to this purchase order'.($location ? ' · '.$location : ''),
                    ));
                }
            }

            if ($order->expected_date && $order->expected_date->betweenIncluded($from, $to)) {
                if (in_array($order->status, ['sent', 'confirmed', 'partial'], true) && $role !== 'accountant') {
                    $events->push($this->generatedPayload(
                        'po-delivery-'.$order->id,
                        'Expected delivery · '.$reference,
                        'delivery',
                        $order->expected_date,
                        collect([$supplier, $location])->filter()->implode(' · '),
                    ));
                }

                if ((float) $order->paid_amount < (float) $order->total_amount
                    && ! in_array($order->status, ['draft', 'cancelled'], true)
                    && in_array($role, ['super_admin', 'accountant'], true)) {
                    $events->push($this->generatedPayload(
                        'po-payment-'.$order->id,
                        'Payment verification · '.$reference,
                        'payment',
                        $order->expected_date,
                        $supplier ? 'Supplier: '.$supplier : null,
                    ));
                }
            }
        }

        if (in_array($role, ['super_admin', 'procurement_manager', 'procurement_officer', 'store_keeper', 'department_manager'], true)) {
            $requests = ReplenishmentRequest::query()
                ->where('organization_id', $user->organization_id)
                ->with(['product:id,name', 'warehouse:id,name'])
                ->whereBetween('created_at', [$from, $to]);

            if ($role === 'store_keeper') $requests->where('requested_by', $user->id);
            if ($role === 'department_manager') $requests->where('department_id', $user->department_id ?? 0);

            foreach ($requests->latest()->limit(100)->get() as $request) {
                $events->push($this->generatedPayload(
                    'requisition-'.$request->id,
                    'Requisition · '.($request->product?->name ?? $request->reference),
                    'requisition',
                    $request->created_at,
                    collect([$request->reference, $request->warehouse?->name, ucfirst($request->status)])->filter()->implode(' · '),
                ));
            }
        }

        return $events;
    }

    private function payload(CalendarEvent $event): array
    {
        return [
            'id' => (string) $event->id,
            'title' => $event->title,
            'type' => $event->type,
            'startsAt' => $event->starts_at->toIso8601String(),
            'endsAt' => $event->ends_at?->toIso8601String(),
            'allDay' => $event->all_day,
            'description' => $event->description,
        ];
    }

    private function generatedPayload(string $id, string $title, string $type, Carbon $startsAt, ?string $description): array
    {
        return [
            'id' => $id,
            'title' => $title,
            'type' => $type,
            'startsAt' => $startsAt->toIso8601String(),
            'endsAt' => null,
            'allDay' => true,
            'description' => $description,
        ];
    }
}
