<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Product, StockBalance, StockIssue, StockMovement, Warehouse};
use App\Services\NotificationService;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Throwable;

class StockController extends Controller
{
    public function replenishmentRequests(Request $request): JsonResponse
    {
        $query = \App\Models\ReplenishmentRequest::with(['product:id,name,sku', 'warehouse:id,name', 'requester:id,name'])->where('organization_id', $this->org($request));
        if ($request->user()->primaryRole() === 'store_keeper') $query->where('requested_by', $request->user()->id);
        return response()->json($query->latest()->limit(200)->get()->map(fn ($item) => $this->requestPayload($item)));
    }

    public function createReplenishmentRequest(Request $request): JsonResponse
    {
        $data = $request->validate(['productId' => ['required', 'integer'], 'warehouseId' => ['required', 'integer'], 'quantity' => ['required', 'numeric', 'gt:0'], 'reason' => ['nullable', 'string', 'max:255'], 'notes' => ['nullable', 'string', 'max:1000']]);
        $organizationId = $this->org($request);
        $product = Product::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['productId']);
        $warehouse = Warehouse::where('organization_id', $organizationId)->where('is_active', true)->findOrFail($data['warehouseId']);
        $record = \App\Models\ReplenishmentRequest::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'requested_by' => $request->user()->id, 'reference' => 'REQ-'.now()->format('YmdHis').'-'.str()->upper(str()->random(4)), 'quantity' => $data['quantity'], 'reason' => $data['reason'] ?? 'Low or ending stock', 'notes' => $data['notes'] ?? null]);
        return response()->json($this->requestPayload($record->load(['product:id,name,sku', 'warehouse:id,name', 'requester:id,name'])), 201);
    }

    public function issues(Request $request): JsonResponse
    {
        return response()->json(StockIssue::with(['product:id,name,sku', 'warehouse:id,name', 'issuer:id,name'])->where('organization_id', $this->org($request))->latest('issued_at')->limit(200)->get()->map(fn (StockIssue $issue) => $this->issuePayload($issue)));
    }

    public function warehouseStock(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless($warehouse->organization_id === $this->org($request), 404);
        $rows = StockBalance::with('product:id,name,sku,reorder_level')->where('organization_id', $this->org($request))->where('warehouse_id', $warehouse->id)->whereHas('product', fn ($query) => $query->where('is_active', true))->get();
        return response()->json($rows->map(fn (StockBalance $row) => ['_id' => (string) $row->id, 'product' => ['id' => (string) $row->product_id, 'name' => $row->product?->name, 'sku' => $row->product?->sku, 'reorderLevel' => (float) ($row->product?->reorder_level ?? 0)], 'quantity' => (float) $row->quantity, 'reservedQuantity' => 0, 'available' => (float) $row->quantity]));
    }

    public function warehouseStats(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless($warehouse->organization_id === $this->org($request), 404);
        $rows = StockBalance::with('product:id,cost_price,reorder_level')->where('organization_id', $this->org($request))->where('warehouse_id', $warehouse->id)->whereHas('product', fn ($query) => $query->where('is_active', true))->get();
        return response()->json(['totalSkus' => $rows->count(), 'totalUnits' => (float) $rows->sum('quantity'), 'totalValue' => (float) $rows->sum(fn ($row) => (float) $row->quantity * (float) ($row->product?->cost_price ?? 0)), 'lowStockCount' => $rows->filter(fn ($row) => (float) $row->quantity <= (float) ($row->product?->reorder_level ?? 0))->count()]);
    }

    public function issue(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate(['productId' => ['required', 'integer'], 'warehouseId' => ['required', 'integer'], 'quantity' => ['required', 'numeric', 'gt:0'], 'issuedTo' => ['required', 'string', 'max:255'], 'recipientContact' => ['nullable', 'string', 'max:50'], 'department' => ['nullable', 'string', 'max:255'], 'purpose' => ['nullable', 'string', 'max:255'], 'notes' => ['nullable', 'string', 'max:1000']]);
        $organizationId = $this->org($request); $product = Product::where('organization_id', $organizationId)->findOrFail($data['productId']); $warehouse = Warehouse::where('organization_id', $organizationId)->findOrFail($data['warehouseId']);
        try {
            $issue = DB::transaction(function () use ($data, $organizationId, $product, $warehouse, $request) {
                $balance = $this->lockedBalance($organizationId, $product, $warehouse); $quantity = (float) $data['quantity']; abort_if((float) $balance->quantity < $quantity, 422, "Insufficient stock in {$warehouse->name}. Available: ".number_format((float) $balance->quantity, 3)); $next = (float) $balance->quantity - $quantity; $balance->update(['quantity' => $next]); $reference = 'ISS-'.now()->format('YmdHis').'-'.str()->upper(str()->random(4));
                $issue = StockIssue::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $request->user()->id, 'reference' => $reference, 'issued_to' => $data['issuedTo'], 'recipient_contact' => $data['recipientContact'] ?? null, 'department' => $data['department'] ?? null, 'quantity' => $quantity, 'purpose' => $data['purpose'] ?? null, 'notes' => $data['notes'] ?? null, 'issued_at' => now()]); StockMovement::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $request->user()->id, 'type' => 'issue', 'quantity' => $quantity, 'balance_after' => $next, 'reason' => 'Issued to '.$data['issuedTo'].(! empty($data['purpose']) ? ' — '.$data['purpose'] : ''), 'reference' => $reference]); return $issue;
            });
        } catch (Throwable $exception) {
            if (str_contains($exception->getMessage(), 'Insufficient stock')) $notifications->notifyNegativeInventoryAttempt($product, $warehouse, (float) $data['quantity'], $request->user()->id);
            throw $exception;
        }
        $balance = StockBalance::where('organization_id', $organizationId)->where('product_id', $product->id)->where('warehouse_id', $warehouse->id)->first(); $notifications->notifyStockLevel($product, $warehouse, (float) ($balance?->quantity ?? 0));
        return response()->json($this->issuePayload($issue->load(['product:id,name,sku', 'warehouse:id,name', 'issuer:id,name'])), 201);
    }

    public function index(Request $request): JsonResponse
    {
        $organizationId = $this->org($request); $rows = StockMovement::where('organization_id', $organizationId)->latest()->limit(200)->get(); $products = Product::whereIn('id', $rows->pluck('product_id'))->pluck('name', 'id'); $warehouseIds = $rows->pluck('warehouse_id')->merge($rows->pluck('from_warehouse_id'))->merge($rows->pluck('to_warehouse_id'))->filter(); $warehouses = Warehouse::whereIn('id', $warehouseIds)->pluck('name', 'id'); $users = \App\Models\User::whereIn('id', $rows->pluck('user_id')->filter())->pluck('name', 'id');
        return response()->json($rows->map(fn ($row) => ['_id' => (string) $row->id, 'product' => ['name' => $products[$row->product_id] ?? 'Unknown product'], 'warehouse' => ['name' => $row->type === 'transfer' ? ($warehouses[$row->from_warehouse_id] ?? '').' → '.($warehouses[$row->to_warehouse_id] ?? '') : ($warehouses[$row->warehouse_id] ?? 'Unknown warehouse')], 'type' => $row->type, 'quantity' => (float) $row->quantity, 'reason' => $row->reason, 'referenceId' => $row->reference, 'user' => ['name' => $users[$row->user_id] ?? 'System'], 'createdAt' => $row->created_at->toIso8601String()]));
    }

    public function adjust(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate(['productId' => ['required', 'integer'], 'warehouseId' => ['required', 'integer'], 'type' => ['required', Rule::in(['add', 'remove'])], 'quantity' => ['required', 'numeric', 'gt:0'], 'reason' => ['nullable', 'string', 'max:1000']]); $organizationId = $this->org($request); $product = Product::where('organization_id', $organizationId)->findOrFail($data['productId']); $warehouse = Warehouse::where('organization_id', $organizationId)->findOrFail($data['warehouseId']);
        try { $movement = DB::transaction(function () use ($data, $organizationId, $product, $warehouse, $request) { $balance = $this->lockedBalance($organizationId, $product, $warehouse); $quantity = (float) $data['quantity']; $next = $data['type'] === 'add' ? (float) $balance->quantity + $quantity : (float) $balance->quantity - $quantity; abort_if($next < 0, 422, "Insufficient stock in {$warehouse->name}. Available: ".number_format((float) $balance->quantity, 3)); $balance->update(['quantity' => $next]); return StockMovement::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $request->user()->id, 'type' => $data['type'], 'quantity' => $quantity, 'balance_after' => $next, 'reason' => $data['reason'] ?? null]); }); }
        catch (Throwable $exception) { if (str_contains($exception->getMessage(), 'Insufficient stock')) $notifications->notifyNegativeInventoryAttempt($product, $warehouse, (float) $data['quantity'], $request->user()->id); throw $exception; }
        $notifications->notifyUnusualStockAdjustment($product, $warehouse, (float) $data['quantity'], (string) ($data['reason'] ?? ''), $request->user()->id); $notifications->notifyStockLevel($product, $warehouse, (float) $movement->balance_after); return response()->json(['id' => $movement->id, 'balance' => (float) $movement->balance_after], 201);
    }

    public function transfer(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate(['productId' => ['required', 'integer'], 'fromWarehouseId' => ['required', 'integer', 'different:toWarehouseId'], 'toWarehouseId' => ['required', 'integer'], 'quantity' => ['required', 'numeric', 'gt:0'], 'reason' => ['nullable', 'string', 'max:1000']]); $organizationId = $this->org($request); $product = Product::where('organization_id', $organizationId)->findOrFail($data['productId']); $from = Warehouse::where('organization_id', $organizationId)->findOrFail($data['fromWarehouseId']); $to = Warehouse::where('organization_id', $organizationId)->findOrFail($data['toWarehouseId']);
        $movement = DB::transaction(function () use ($data, $organizationId, $product, $from, $to, $request) { $ids = [$from->id, $to->id]; sort($ids); foreach ($ids as $id) StockBalance::firstOrCreate(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $id], ['quantity' => 0]); $balances = StockBalance::where('organization_id', $organizationId)->where('product_id', $product->id)->whereIn('warehouse_id', $ids)->orderBy('warehouse_id')->lockForUpdate()->get()->keyBy('warehouse_id'); $source = $balances[$from->id]; $destination = $balances[$to->id]; $quantity = (float) $data['quantity']; abort_if((float) $source->quantity < $quantity, 422, "Insufficient stock in {$from->name}. Available: ".number_format((float) $source->quantity, 3)); $source->update(['quantity' => (float) $source->quantity - $quantity]); $destination->update(['quantity' => (float) $destination->quantity + $quantity]); return StockMovement::create(['organization_id' => $organizationId, 'product_id' => $product->id, 'from_warehouse_id' => $from->id, 'to_warehouse_id' => $to->id, 'user_id' => $request->user()->id, 'type' => 'transfer', 'quantity' => $quantity, 'balance_after' => (float) $destination->quantity, 'reason' => $data['reason'] ?? null]); });
        $fromBalance = StockBalance::where('organization_id', $organizationId)->where('product_id', $product->id)->where('warehouse_id', $from->id)->value('quantity'); $toBalance = StockBalance::where('organization_id', $organizationId)->where('product_id', $product->id)->where('warehouse_id', $to->id)->value('quantity'); $notifications->notifyStockLevel($product, $from, (float) $fromBalance); $notifications->notifyStockLevel($product, $to, (float) $toBalance); return response()->json(['id' => $movement->id, 'transferred' => (float) $movement->quantity], 201);
    }

    public function valuation(Request $request): JsonResponse
    {
        $organizationId = $this->org($request); $products = Product::where('organization_id', $organizationId)->where('is_active', true)->get(); $quantities = StockBalance::where('organization_id', $organizationId)->selectRaw('product_id,SUM(quantity) as quantity')->groupBy('product_id')->pluck('quantity', 'product_id'); $totalUnits = $products->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0)); $totalCost = $products->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0) * (float) $product->cost_price); $totalSell = $products->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0) * (float) $product->selling_price); $categoryNames = DB::table('categories')->where('organization_id', $organizationId)->pluck('name', 'id'); $breakdown = $products->groupBy(fn ($product) => (string) ($product->category_id ?? 'none'))->map(function ($items, $categoryId) use ($quantities, $categoryNames) { return ['name' => $categoryId === 'none' ? 'Uncategorized' : ($categoryNames[$categoryId] ?? 'Uncategorized'), 'costValue' => $items->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0) * (float) $product->cost_price), 'sellValue' => $items->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0) * (float) $product->selling_price), 'units' => $items->sum(fn ($product) => (float) ($quantities[$product->id] ?? 0))]; })->values(); return response()->json(['totalCostValue' => $totalCost, 'totalSellValue' => $totalSell, 'potentialProfit' => $totalSell - $totalCost, 'totalUnits' => $totalUnits, 'totalProducts' => $products->count(), 'categoryBreakdown' => $breakdown]);
    }

    private function lockedBalance(int $organizationId, Product $product, Warehouse $warehouse): StockBalance { $balance = StockBalance::firstOrCreate(['organization_id' => $organizationId, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id], ['quantity' => 0]); return StockBalance::whereKey($balance->id)->lockForUpdate()->firstOrFail(); }
    private function org(Request $request): int { return (int) $request->user()->organization_id; }
    private function issuePayload(StockIssue $issue): array { return ['id' => (string) $issue->id, 'reference' => $issue->reference, 'product' => ['id' => (string) $issue->product_id, 'name' => $issue->product?->name, 'sku' => $issue->product?->sku], 'warehouse' => ['id' => (string) $issue->warehouse_id, 'name' => $issue->warehouse?->name], 'issuedTo' => $issue->issued_to, 'recipientContact' => $issue->recipient_contact, 'department' => $issue->department, 'quantity' => (float) $issue->quantity, 'purpose' => $issue->purpose, 'notes' => $issue->notes, 'issuedAt' => $issue->issued_at?->toIso8601String(), 'issuedBy' => $issue->issuer?->name]; }
    private function requestPayload(\App\Models\ReplenishmentRequest $item): array { return ['id' => (string) $item->id, 'reference' => $item->reference, 'product' => ['id' => (string) $item->product_id, 'name' => $item->product?->name, 'sku' => $item->product?->sku], 'warehouse' => ['id' => (string) $item->warehouse_id, 'name' => $item->warehouse?->name], 'quantity' => (float) $item->quantity, 'reason' => $item->reason, 'notes' => $item->notes, 'status' => $item->status, 'requestedBy' => $item->requester?->name, 'createdAt' => $item->created_at?->toIso8601String()]; }
}
