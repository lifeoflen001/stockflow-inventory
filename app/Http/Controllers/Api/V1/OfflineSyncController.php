<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{OfflineOperation, Product, StockBalance, Warehouse};
use App\Services\OfflineOperationService;
use App\Support\ApiResponse;
use Illuminate\Http\{JsonResponse, Request};

class OfflineSyncController extends Controller
{
    public function snapshot(Request $request): JsonResponse
    {
        $user = $request->user();
        $products = Product::query()->where('organization_id', $user->organization_id)->where('is_active', true)->get(['id', 'sku', 'name', 'description', 'cost_price', 'selling_price', 'tax_rate', 'reorder_level', 'expires_at']);
        $warehouses = Warehouse::query()->where('organization_id', $user->organization_id)->where('is_active', true)->get(['id', 'name', 'code']);
        $balances = StockBalance::query()->where('organization_id', $user->organization_id)->get(['product_id', 'warehouse_id', 'quantity'])->groupBy('product_id');
        return ApiResponse::success(['serverTime' => now()->toIso8601String(), 'products' => $products->map(fn ($product) => ['id' => (string) $product->id, 'sku' => $product->sku, 'name' => $product->name, 'description' => $product->description, 'costPrice' => (float) $product->cost_price, 'sellingPrice' => (float) $product->selling_price, 'taxRate' => (float) $product->tax_rate, 'reorderLevel' => (float) $product->reorder_level, 'expiresAt' => $product->expires_at?->toDateString(), 'stock' => $balances->get($product->id, collect())->mapWithKeys(fn ($balance) => [(string) $balance->warehouse_id => (float) $balance->quantity])->all()])->values(), 'warehouses' => $warehouses->map(fn ($warehouse) => ['id' => (string) $warehouse->id, 'name' => $warehouse->name, 'code' => $warehouse->code])->values(), 'permissions' => $user->effectivePermissionNames()->values()]);
    }

    public function index(Request $request, OfflineOperationService $service): JsonResponse
    {
        $operations = OfflineOperation::query()->where('organization_id', $request->user()->organization_id)->where('user_id', $request->user()->id)->latest()->limit(200)->get()->map(fn (OfflineOperation $operation) => $service->payload($operation));
        return ApiResponse::success($operations->values());
    }

    public function sync(Request $request, OfflineOperationService $service): JsonResponse
    {
        $data = $request->validate(['operations' => ['required', 'array', 'max:100'], 'operations.*.operationId' => ['required', 'string', 'max:100'], 'operations.*.deviceId' => ['required', 'string', 'max:160'], 'operations.*.operationType' => ['required', 'string', 'max:60'], 'operations.*.payload' => ['required', 'array'], 'operations.*.baseVersions' => ['nullable', 'array'], 'operations.*.clientCreatedAt' => ['nullable', 'date']]);
        return ApiResponse::success(['results' => $service->sync($request->user(), $data['operations'])]);
    }

    public function retry(Request $request, OfflineOperation $operation, OfflineOperationService $service): JsonResponse
    {
        return ApiResponse::success($service->retry($request->user(), $operation));
    }
}
