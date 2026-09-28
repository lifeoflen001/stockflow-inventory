<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Product, StockBalance, Warehouse, WarehouseProductLocation};
use Illuminate\Http\{JsonResponse, Request};

class WarehouseLocatorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organizationId = $request->user()->organization_id;
        $warehouseId = $request->integer('warehouseId');

        $warehouse = Warehouse::where('organization_id', $organizationId)
            ->where('is_active', true)
            ->when($warehouseId, fn ($query) => $query->whereKey($warehouseId))
            ->orderBy('name')
            ->first();

        if (!$warehouse) return response()->json(['warehouse' => null, 'rows' => []]);

        $balances = StockBalance::with('product:id,name,sku,reorder_level')
            ->where('organization_id', $organizationId)
            ->where('warehouse_id', $warehouse->id)
            ->whereHas('product', fn ($query) => $query->where('is_active', true))
            ->orderBy('id')
            ->get();
        $locations = WarehouseProductLocation::where('organization_id', $organizationId)
            ->where('warehouse_id', $warehouse->id)
            ->whereIn('product_id', $balances->pluck('product_id'))
            ->get()
            ->keyBy('product_id');

        return response()->json([
            'warehouse' => ['id' => (string) $warehouse->id, 'name' => $warehouse->name],
            'rows' => $balances->map(function (StockBalance $balance) use ($locations): array {
                $location = $locations->get($balance->product_id);
                return [
                    'id' => (string) $balance->id,
                    'product' => ['id' => (string) $balance->product_id, 'name' => $balance->product?->name, 'sku' => $balance->product?->sku],
                    'quantity' => (float) $balance->quantity,
                    'reorderLevel' => (float) ($balance->product?->reorder_level ?? 0),
                    'location' => $location ? ['id' => (string) $location->id, 'section' => $location->section, 'shelf' => $location->shelf, 'notes' => $location->notes] : null,
                ];
            })->values(),
        ]);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $organizationId = $request->user()->organization_id;
        abort_unless($product->organization_id === $organizationId, 404);
        $data = $request->validate([
            'warehouseId' => ['required', 'integer'],
            'section' => ['nullable', 'string', 'max:100'],
            'shelf' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
        $warehouse = Warehouse::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['warehouseId']);
        $location = WarehouseProductLocation::updateOrCreate(
            ['organization_id' => $organizationId, 'warehouse_id' => $warehouse->id, 'product_id' => $product->id],
            ['section' => trim((string) ($data['section'] ?? '')) ?: null, 'shelf' => trim((string) ($data['shelf'] ?? '')) ?: null, 'notes' => trim((string) ($data['notes'] ?? '')) ?: null],
        );

        return response()->json(['id' => (string) $location->id, 'section' => $location->section, 'shelf' => $location->shelf, 'notes' => $location->notes]);
    }
}
