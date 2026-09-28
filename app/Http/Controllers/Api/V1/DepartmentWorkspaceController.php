<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Department, Product, ReplenishmentRequest, Warehouse};
use App\Services\NotificationService;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Validation\Rule;

class DepartmentWorkspaceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $department = $this->department($request);
        if (! $department) return response()->json(['department' => null, 'summary' => $this->emptySummary(), 'orders' => [], 'purchaseOrders' => []]);

        $orders = ReplenishmentRequest::with(['product:id,name,sku', 'warehouse:id,name', 'requester:id,name'])
            ->where('organization_id', $this->org($request))->where('department_id', $department->id)->latest()->limit(100)->get();
        $purchaseOrders = $department->purchaseOrders()->with(['supplier:id,name', 'warehouse:id,name'])->latest()->limit(100)->get();

        return response()->json([
            'department' => ['id' => (string) $department->id, 'name' => $department->name, 'code' => $department->code, 'branch' => $department->branch?->name],
            'summary' => [
                'totalOrders' => $orders->count(),
                'pendingOrders' => $orders->where('status', 'pending')->count(),
                'approvedOrders' => $orders->where('status', 'approved')->count(),
                'openPurchaseOrders' => $purchaseOrders->whereIn('status', ['draft', 'sent', 'confirmed', 'partial'])->count(),
                'receivedOrders' => $purchaseOrders->whereIn('status', ['received'])->count(),
                'committedSpend' => (float) $purchaseOrders->whereNotIn('status', ['cancelled'])->sum('total_amount'),
            ],
            'orders' => $orders->map(fn (ReplenishmentRequest $order) => $this->orderPayload($order))->values(),
            'purchaseOrders' => $purchaseOrders->map(fn ($order) => [
                'id' => (string) $order->id, 'poNumber' => $order->po_number, 'status' => $order->status,
                'supplier' => $order->supplier ? ['id' => (string) $order->supplier->id, 'name' => $order->supplier->name] : null,
                'warehouse' => $order->warehouse ? ['id' => (string) $order->warehouse->id, 'name' => $order->warehouse->name] : null,
                'totalAmount' => (float) $order->total_amount, 'expectedDate' => $order->expected_date?->toDateString(),
            ])->values(),
        ]);
    }

    public function storeOrder(Request $request, NotificationService $notifications): JsonResponse
    {
        $department = $this->department($request, true);
        abort_unless($department, 422, 'Assign this user to an active department before creating a departmental order.');
        $data = $request->validate([
            'departmentId' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('organization_id', $this->org($request))->where('is_active', true)],
            'productId' => ['required', 'integer'], 'warehouseId' => ['required', 'integer'],
            'quantity' => ['required', 'numeric', 'gt:0'], 'reason' => ['nullable', 'string', 'max:255'], 'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $product = Product::where('organization_id', $this->org($request))->where('is_active', true)->findOrFail($data['productId']);
        $warehouse = Warehouse::where('organization_id', $this->org($request))->where('is_active', true)->findOrFail($data['warehouseId']);
        $order = ReplenishmentRequest::create([
            'organization_id' => $this->org($request), 'department_id' => $department->id, 'product_id' => $product->id,
            'warehouse_id' => $warehouse->id, 'requested_by' => $request->user()->id,
            'reference' => 'DOR-'.now()->format('YmdHis').'-'.str()->upper(str()->random(4)),
            'quantity' => $data['quantity'], 'reason' => $data['reason'] ?? 'Departmental stock requirement', 'notes' => $data['notes'] ?? null,
        ])->load(['product:id,name,sku', 'warehouse:id,name', 'requester:id,name']);
        $notifications->notifyDepartmentalOrder($order, $department);
        return response()->json($this->orderPayload($order), 201);
    }

    private function department(Request $request, bool $forCreate = false): ?Department
    {
        $user = $request->user();
        $id = $user->primaryRole() === 'super_admin' && $request->filled('departmentId') ? $request->integer('departmentId') : $user->department_id;
        if (! $id) return null;
        return Department::with('branch:id,name')->where('organization_id', $this->org($request))->where('is_active', true)->find($id);
    }

    private function orderPayload(ReplenishmentRequest $order): array
    {
        return [
            'id' => (string) $order->id, 'reference' => $order->reference, 'status' => $order->status, 'quantity' => (float) $order->quantity,
            'reason' => $order->reason, 'notes' => $order->notes, 'createdAt' => $order->created_at?->toIso8601String(),
            'product' => $order->product ? ['id' => (string) $order->product->id, 'name' => $order->product->name, 'sku' => $order->product->sku] : null,
            'warehouse' => $order->warehouse ? ['id' => (string) $order->warehouse->id, 'name' => $order->warehouse->name] : null,
            'requestedBy' => $order->requester?->name,
        ];
    }

    private function emptySummary(): array { return ['totalOrders' => 0, 'pendingOrders' => 0, 'approvedOrders' => 0, 'openPurchaseOrders' => 0, 'receivedOrders' => 0, 'committedSpend' => 0]; }
    private function org(Request $request): int { return (int) $request->user()->organization_id; }
}
