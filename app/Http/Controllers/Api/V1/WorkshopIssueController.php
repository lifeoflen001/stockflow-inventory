<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Product, StockBalance, StockMovement, Vehicle, Warehouse, WorkshopIssueBatch, WorkshopIssueItem, WorkshopStaff};
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkshopIssueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $batches = WorkshopIssueBatch::with(['warehouse:id,name', 'vehicle:id,registration_number,make,model', 'collector:id,name,staff_number', 'issuer:id,name', 'items.product:id,name,sku'])->where('organization_id', $request->user()->organization_id)->latest('issued_at')->limit(200)->get();
        return response()->json($batches->map(fn ($batch) => $this->payload($batch)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouseId' => ['required', 'integer'],
            'vehicleId' => ['nullable', 'integer'],
            'collectorStaffId' => ['nullable', 'integer'],
            'issuedAt' => ['required', 'date'],
            'purpose' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.productId' => ['required', 'integer', 'distinct'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit' => ['nullable', 'string', 'max:30'],
            'items.*.comment' => ['nullable', 'string', 'max:500'],
        ]);
        $organizationId = (int) $request->user()->organization_id;
        $warehouse = Warehouse::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['warehouseId']);
        $vehicle = ! empty($data['vehicleId']) ? Vehicle::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['vehicleId']) : null;
        $collector = ! empty($data['collectorStaffId']) ? WorkshopStaff::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['collectorStaffId']) : null;

        $batch = DB::transaction(function () use ($data, $request, $organizationId, $warehouse, $vehicle, $collector) {
            $reference = 'WIS-'.now()->format('YmdHis').'-'.str()->upper(str()->random(4));
            $batch = WorkshopIssueBatch::create(['organization_id' => $organizationId, 'warehouse_id' => $warehouse->id, 'vehicle_id' => $vehicle?->id, 'collector_staff_id' => $collector?->id, 'issued_by' => $request->user()->id, 'reference' => $reference, 'purpose' => $data['purpose'] ?? null, 'notes' => $data['notes'] ?? null, 'issued_at' => $data['issuedAt']]);
            foreach ($data['items'] as $line) {
                $product = Product::with('unit:id,name,abbreviation')->where('organization_id', $organizationId)->where('is_active', true)->findOrFail($line['productId']);
                $balance = StockBalance::firstOrCreate(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id], ['quantity' => 0]);
                $balance = StockBalance::whereKey($balance->id)->lockForUpdate()->firstOrFail();
                $before = (float) $balance->quantity;
                $quantity = (float) $line['quantity'];
                abort_if($before < $quantity, 422, "Insufficient stock for {$product->name}. Available: ".number_format($before, 3));
                $after = $before - $quantity;
                $balance->update(['quantity' => $after]);
                WorkshopIssueItem::create(['workshop_issue_batch_id' => $batch->id, 'product_id' => $product->id, 'quantity_before' => $before, 'quantity_out' => $quantity, 'quantity_after' => $after, 'unit' => $line['unit'] ?? $product->unit?->abbreviation ?? $product->unit?->name, 'comment' => $line['comment'] ?? null]);
                StockMovement::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $request->user()->id, 'type' => 'issue', 'quantity' => $quantity, 'balance_after' => $after, 'reason' => 'Workshop warehouse issue'.($data['purpose'] ?? null ? ' - '.$data['purpose'] : ''), 'reference' => $reference]);
            }
            return $batch;
        });

        return response()->json($this->payload($batch->load(['warehouse:id,name', 'vehicle:id,registration_number,make,model', 'collector:id,name,staff_number', 'issuer:id,name', 'items.product:id,name,sku'])), 201);
    }

    private function payload(WorkshopIssueBatch $batch): array
    {
        return ['id' => (string) $batch->id, 'reference' => $batch->reference, 'warehouse' => ['id' => (string) $batch->warehouse_id, 'name' => $batch->warehouse?->name], 'vehicle' => $batch->vehicle ? ['id' => (string) $batch->vehicle->id, 'registrationNumber' => $batch->vehicle->registration_number, 'make' => $batch->vehicle->make, 'model' => $batch->vehicle->model] : null, 'collector' => $batch->collector ? ['id' => (string) $batch->collector->id, 'name' => $batch->collector->name, 'staffNumber' => $batch->collector->staff_number] : null, 'issuedBy' => $batch->issuer?->name, 'purpose' => $batch->purpose, 'notes' => $batch->notes, 'issuedAt' => $batch->issued_at?->toIso8601String(), 'items' => $batch->items->map(fn ($item) => ['id' => (string) $item->id, 'product' => ['id' => (string) $item->product_id, 'name' => $item->product?->name, 'sku' => $item->product?->sku], 'quantityBefore' => (float) $item->quantity_before, 'quantityOut' => (float) $item->quantity_out, 'quantityAfter' => (float) $item->quantity_after, 'unit' => $item->unit, 'comment' => $item->comment])->values()];
    }
}
