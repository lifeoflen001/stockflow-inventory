<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Department, Product, PurchaseOrder, PurchaseOrderPayment, ReplenishmentRequest, StockBalance, StockMovement};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{Cache, DB};
use Closure;

class OperationsDashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $user->primaryRole() ?? 'store_keeper';
        $cacheKey = sprintf('operations-dashboard:%d:%d:%s', (int) $user->organization_id, (int) $user->id, $role);

        return $this->rememberedResponse($cacheKey, function () use ($request, $role): JsonResponse {
            if ($role === 'department_manager') return $this->departmentDashboard($request);
            if ($role === 'accountant') return $this->accountantDashboard($request);
            if ($role === 'supplier') return $this->supplierDashboard($request);
            return $this->standardDashboard($request);
        });
    }

    private function rememberedResponse(string $key, Closure $callback): JsonResponse
    {
        $payload = Cache::remember($key, now()->addSeconds(12), function () use ($callback): array {
            $response = $callback();
            return json_decode($response->getContent(), true, 512, JSON_THROW_ON_ERROR);
        });

        return response()->json($payload);
    }

    private function standardDashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $organizationId = (int) $user->organization_id;
        $today = now()->startOfDay();
        $openStatuses = ['draft', 'sent', 'confirmed', 'partial'];
        $inboundStatuses = ['sent', 'confirmed', 'partial'];
        $role = $user->primaryRole() ?? 'store_keeper';
        $isSuperAdmin = $role === 'super_admin';
        $isManager = $isSuperAdmin || $user->hasPermission('purchase_orders.approve');
        $isProcurement = $isManager || $user->hasPermission('purchase_orders.create');
        $isStoreRole = !$isProcurement && $user->hasPermission('inventory.view');

        $orders = PurchaseOrder::query()->where('organization_id', $organizationId)
            ->with(['supplier:id,name', 'warehouse:id,name', 'store:id,name'])->latest();
        $openOrders = (clone $orders)->whereIn('status', $openStatuses);
        $overdueOrders = (clone $orders)->whereIn('status', $inboundStatuses)
            ->whereNotNull('expected_date')->whereDate('expected_date', '<', $today);
        $monthlyOrders = (clone $orders)->where('status', '!=', 'cancelled')
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()]);
        $yearlyOrders = (clone $orders)->where('status', '!=', 'cancelled')
            ->whereBetween('created_at', [now()->startOfYear(), now()->endOfYear()]);
        $statusCounts = (clone $orders)->reorder()->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')->pluck('total', 'status');
        $orderAggregate = (clone $orders)->reorder()
            ->selectRaw("COUNT(*) as total_orders,
                SUM(CASE WHEN status IN ('draft','sent','confirmed','partial') THEN 1 ELSE 0 END) as open_orders,
                SUM(CASE WHEN status IN ('sent','confirmed','partial') THEN 1 ELSE 0 END) as inbound_orders,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_orders,
                SUM(CASE WHEN status IN ('sent','confirmed') THEN 1 ELSE 0 END) as follow_up_orders,
                SUM(CASE WHEN status IN ('confirmed','partial') THEN 1 ELSE 0 END) as expected_receipts,
                SUM(CASE WHEN status IN ('sent','confirmed','partial') AND expected_date IS NOT NULL AND expected_date < ? THEN 1 ELSE 0 END) as overdue_orders,
                COALESCE(SUM(CASE WHEN status IN ('draft','sent','confirmed','partial') THEN total_amount ELSE 0 END), 0) as open_order_value,
                COALESCE(SUM(CASE WHEN status IN ('sent','confirmed','partial') AND expected_date IS NOT NULL AND expected_date < ? THEN total_amount ELSE 0 END), 0) as overdue_order_value,
                COALESCE(SUM(CASE WHEN status <> 'cancelled' AND created_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) as monthly_total,
                COALESCE(SUM(CASE WHEN status <> 'cancelled' AND created_at BETWEEN ? AND ? THEN paid_amount ELSE 0 END), 0) as monthly_paid,
                COALESCE(SUM(CASE WHEN status <> 'cancelled' AND created_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) as yearly_total",
                [$today->toDateString(), $today->toDateString(), now()->startOfMonth(), now()->endOfMonth(), now()->startOfMonth(), now()->endOfMonth(), now()->startOfYear(), now()->endOfYear()])
            ->first();

        $pendingRequests = ReplenishmentRequest::query()->where('organization_id', $organizationId)->where('status', 'pending');
        $approvedRequests = ReplenishmentRequest::query()->where('organization_id', $organizationId)->where('status', 'approved');
        if ($isStoreRole && $user->id) {
            $pendingRequests->where('requested_by', $user->id);
            $approvedRequests->where('requested_by', $user->id);
        }
        $requestAggregate = ReplenishmentRequest::query()->where('organization_id', $organizationId)
            ->when($isStoreRole && $user->id, fn ($query) => $query->where('requested_by', $user->id))
            ->selectRaw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_requests,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_requests,
                SUM(CASE WHEN status = 'pending' AND created_at < ? THEN 1 ELSE 0 END) as delayed_pending_requests",
                [now()->subDays(3)])
            ->first();
        $pendingRequestCount = (int) ($requestAggregate->pending_requests ?? 0);
        $approvedRequestCount = (int) ($requestAggregate->approved_requests ?? 0);
        $delayedPendingRequestCount = (int) ($requestAggregate->delayed_pending_requests ?? 0);
        $openOrderCount = (int) ($orderAggregate->open_orders ?? 0);
        $inboundOrderCount = (int) ($orderAggregate->inbound_orders ?? 0);
        $sentOrderCount = (int) ($orderAggregate->sent_orders ?? 0);
        $followUpOrderCount = (int) ($orderAggregate->follow_up_orders ?? 0);
        $expectedReceiptCount = (int) ($orderAggregate->expected_receipts ?? 0);
        $overdueCount = (int) ($orderAggregate->overdue_orders ?? 0);
        $openOrderValue = (float) ($orderAggregate->open_order_value ?? 0);

        $products = Product::query()->where('organization_id', $organizationId)->where('is_active', true)
            ->get(['id', 'sku', 'name', 'reorder_level', 'cost_price']);
        $balances = StockBalance::query()->where('organization_id', $organizationId)
            ->selectRaw('product_id, SUM(quantity) as quantity')->groupBy('product_id')->pluck('quantity', 'product_id');
        $stockStatus = collect(['In stock' => 0, 'Low stock' => 0, 'Out of stock' => 0]);
        $lowStockProducts = collect();
        $inventoryUnits = 0.0;
        $inventoryValue = 0.0;
        foreach ($products as $product) {
            $quantity = (float) ($balances[$product->id] ?? 0);
            $inventoryUnits += $quantity;
            $inventoryValue += $quantity * (float) $product->cost_price;
            if ($quantity <= 0) $stockStatus->put('Out of stock', $stockStatus->get('Out of stock') + 1);
            elseif ($quantity <= (float) $product->reorder_level) { $stockStatus->put('Low stock', $stockStatus->get('Low stock') + 1); $lowStockProducts->push($product); }
            else $stockStatus->put('In stock', $stockStatus->get('In stock') + 1);
        }

        $locationStock = DB::table('stock_balances')->join('warehouses', 'warehouses.id', '=', 'stock_balances.warehouse_id')
            ->where('stock_balances.organization_id', $organizationId)->select('warehouses.name', DB::raw('SUM(stock_balances.quantity) as value'))
            ->groupBy('warehouses.id', 'warehouses.name')->orderByDesc('value')->limit(8)->get()
            ->map(fn ($row) => ['name' => $row->name, 'value' => (float) $row->value])->values();
        $warehouseComparison = DB::table('stock_balances')->join('warehouses', 'warehouses.id', '=', 'stock_balances.warehouse_id')
            ->join('products', 'products.id', '=', 'stock_balances.product_id')->where('stock_balances.organization_id', $organizationId)
            ->select('warehouses.id', 'warehouses.name', DB::raw('SUM(stock_balances.quantity) as units'), DB::raw('SUM(stock_balances.quantity * products.cost_price) as value'))
            ->groupBy('warehouses.id', 'warehouses.name')->orderByDesc('units')->limit(8)->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name, 'units' => (float) $row->units, 'value' => (float) $row->value])->values();

        $movementRows = StockMovement::query()->where('organization_id', $organizationId)
            ->where('created_at', '>=', now()->subDays(6)->startOfDay())->get(['type', 'quantity', 'created_at']);
        $movementToday = $movementRows->filter(fn ($row) => $row->created_at->isToday());
        $movementTrend = collect(range(6, 0))->map(function (int $daysAgo) use ($movementRows) {
            $date = now()->subDays($daysAgo)->toDateString();
            $rows = $movementRows->filter(fn ($row) => $row->created_at->toDateString() === $date);
            return ['date' => $date, 'received' => (float) $rows->whereIn('type', ['purchase_receipt', 'add'])->sum('quantity'), 'issued' => (float) $rows->where('type', 'issue')->sum('quantity'), 'transferred' => (float) $rows->where('type', 'transfer')->sum('quantity'), 'adjusted' => (float) $rows->whereIn('type', ['remove', 'sale'])->sum('quantity')];
        })->values();

        $pendingRequestRows = (clone $pendingRequests)->with(['product:id,name', 'warehouse:id,name'])->latest()->limit(8)->get();
        $approvedRequestRows = (clone $approvedRequests)->with(['product:id,name', 'warehouse:id,name'])->latest()->limit(8)->get();
        // All dashboard queues are projections of the same recent PO window.
        // The previous implementation issued a separate query (and relation
        // loads) for every queue, which multiplied latency as the dataset grew.
        $dashboardOrderRows = (clone $orders)
            ->whereIn('status', $openStatuses)
            ->select(['id', 'organization_id', 'supplier_id', 'warehouse_id', 'store_id', 'po_number', 'status', 'total_amount', 'paid_amount', 'expected_date', 'created_at', 'updated_at'])
            ->limit(40)->get();
        $draftOrderRows = $dashboardOrderRows->where('status', 'draft')->take(8);
        $approvedOrderRows = $dashboardOrderRows->where('status', 'sent')->take(8);
        $followUpOrderRows = $dashboardOrderRows->whereIn('status', ['sent', 'confirmed'])->take(8);
        $receiptRows = $dashboardOrderRows->filter(fn ($row) => in_array($row->status, ['confirmed', 'partial'], true) && (! $row->expected_date || $row->expected_date->gte(now()->startOfDay())))->take(8);
        $overdueRows = $dashboardOrderRows->filter(fn ($row) => in_array($row->status, $inboundStatuses, true) && $row->expected_date?->lt($today))->take(8);

        $requestQueue = $pendingRequestRows->map(fn ($row) => ['id' => 'request-'.$row->id, 'reference' => $row->reference, 'title' => 'Replenishment request: '.$row->product?->name, 'location' => $row->warehouse?->name, 'status' => $row->status, 'priority' => $row->created_at->lt(now()->subDays(3)) ? 'high' : 'normal', 'dueAt' => $row->created_at->copy()->addDays(3)->toIso8601String(), 'nextAction' => $isManager ? 'Review request' : 'Track request']);
        $approvedQueue = $approvedRequestRows->map(fn ($row) => ['id' => 'approved-'.$row->id, 'reference' => $row->reference, 'title' => 'Approved request: '.$row->product?->name, 'location' => $row->warehouse?->name, 'status' => $row->status, 'priority' => 'normal', 'nextAction' => 'Prepare purchase order']);
        $approvalQueue = $draftOrderRows->map(fn ($row) => ['id' => 'po-approval-'.$row->id, 'reference' => $row->po_number, 'title' => 'Purchase order awaiting manager approval', 'supplier' => $row->supplier?->name, 'location' => $row->warehouse?->name ?? $row->store?->name, 'status' => $row->status, 'priority' => 'high', 'amount' => $isManager ? (float) $row->total_amount : null, 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => 'Approve PO']);
        $issueQueue = $approvedOrderRows->map(fn ($row) => ['id' => 'po-'.$row->id, 'reference' => $row->po_number, 'title' => 'Approved purchase order ready to proceed', 'supplier' => $row->supplier?->name, 'location' => $row->warehouse?->name ?? $row->store?->name, 'status' => $row->status, 'priority' => 'normal', 'amount' => $isManager ? (float) $row->total_amount : null, 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => 'Issue PO']);
        $followUpQueue = $followUpOrderRows->map(fn ($row) => ['id' => 'followup-'.$row->id, 'reference' => $row->po_number, 'title' => $row->status === 'sent' ? 'Awaiting supplier confirmation' : 'Inbound order to follow up', 'supplier' => $row->supplier?->name, 'location' => $row->warehouse?->name ?? $row->store?->name, 'status' => $row->status, 'priority' => 'normal', 'amount' => $isManager ? (float) $row->total_amount : null, 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => 'Follow up supplier']);
        $receiptQueue = $receiptRows->map(fn ($row) => ['id' => 'receipt-'.$row->id, 'reference' => $row->po_number, 'title' => 'Expected receipt', 'supplier' => $row->supplier?->name, 'location' => $row->warehouse?->name ?? $row->store?->name, 'status' => $row->status, 'priority' => 'normal', 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => 'Receive goods']);
        $lowStockQueue = $lowStockProducts->take(8)->map(fn ($product) => ['id' => 'stock-'.$product->id, 'reference' => $product->sku, 'title' => 'Stock at or below reorder level: '.$product->name, 'status' => 'low', 'priority' => ((float) ($balances[$product->id] ?? 0)) <= 0 ? 'critical' : 'high', 'nextAction' => 'Review stock']);
        $overdueQueue = $overdueRows->map(fn ($row) => ['id' => 'overdue-'.$row->id, 'reference' => $row->po_number, 'title' => 'Delivery overdue', 'supplier' => $row->supplier?->name, 'location' => $row->warehouse?->name ?? $row->store?->name, 'status' => $row->status, 'priority' => 'high', 'amount' => $isManager ? (float) $row->total_amount : null, 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => $isManager ? 'Follow up supplier' : 'Open exception']);
        // map() on an Eloquent collection keeps the Eloquent collection type;
        // merge() then expects models and calls getKey() on our array rows.
        // Convert queue rows to base collections before combining them.
        $requestQueue = $requestQueue->toBase();
        $approvedQueue = $approvedQueue->toBase();
        $approvalQueue = $approvalQueue->toBase();
        $issueQueue = $issueQueue->toBase();
        $followUpQueue = $followUpQueue->toBase();
        $receiptQueue = $receiptQueue->toBase();
        $lowStockQueue = $lowStockQueue->toBase();
        $overdueQueue = $overdueQueue->toBase();
        $workQueue = match (true) { $isSuperAdmin => $requestQueue->merge($approvalQueue)->merge($overdueQueue)->merge($lowStockQueue), $isManager => $requestQueue->merge($approvalQueue)->merge($overdueQueue), $isProcurement => $approvedQueue->merge($issueQueue)->merge($followUpQueue), default => $receiptQueue->merge($lowStockQueue) };
        $exceptions = $overdueQueue->values();

        $activity = StockMovement::query()->where('stock_movements.organization_id', $organizationId)->leftJoin('users', 'users.id', '=', 'stock_movements.user_id')->leftJoin('products', 'products.id', '=', 'stock_movements.product_id')->latest('stock_movements.created_at')->limit(8)
            ->get(['stock_movements.id', 'stock_movements.type', 'stock_movements.reference', 'stock_movements.created_at', 'users.name as actor', 'products.name as product'])
            ->map(fn ($row) => ['id' => 'movement-'.$row->id, 'actor' => $row->actor ?? 'System', 'action' => str_replace('_', ' ', $row->type), 'reference' => $row->reference ?: ($row->product ?? 'Stock movement'), 'occurredAt' => \Illuminate\Support\Carbon::parse($row->created_at)->toIso8601String(), 'stage' => $row->type === 'purchase_receipt' ? 'goods_receipt' : 'stock_posting'])->values();

        $monthlyTotal = (float) ($orderAggregate->monthly_total ?? 0);
        $yearlyTotal = (float) ($orderAggregate->yearly_total ?? 0);
        $monthlyPaid = (float) ($orderAggregate->monthly_paid ?? 0);
        $pendingApprovalCount = $pendingRequestCount + (int) ($statusCounts['draft'] ?? 0);
        $metricValues = ['pending_approvals' => $pendingApprovalCount, 'open_purchase_orders' => $openOrderCount, 'inbound_shipments' => $inboundOrderCount, 'workflow_exceptions' => $overdueCount + (int) $stockStatus->get('Low stock'), 'monthly_spend' => $monthlyTotal, 'supplier_delays' => $overdueCount, 'budget_utilization' => $monthlyTotal > 0 ? round(($monthlyPaid / $monthlyTotal) * 100, 1) : 0, 'approved_requisitions' => $approvedRequestCount, 'purchase_orders_to_issue' => $sentOrderCount, 'supplier_followups' => $followUpOrderCount, 'overdue_deliveries' => $overdueCount, 'expected_receipts' => $expectedReceiptCount, 'awaiting_inspection' => 0, 'open_transfers' => (int) $movementRows->where('type', 'transfer')->count(), 'low_stock_items' => (int) $stockStatus->get('Low stock'), 'inventory_value' => $inventoryValue, 'inventory_units' => $inventoryUnits, 'out_of_stock_items' => (int) $stockStatus->get('Out of stock'), 'open_purchase_order_value' => $openOrderValue];
        $roleMetricKeys = ['super_admin' => ['pending_approvals', 'open_purchase_orders', 'inbound_shipments', 'workflow_exceptions', 'inventory_value', 'monthly_spend'], 'procurement_manager' => ['pending_approvals', 'monthly_spend', 'supplier_delays', 'budget_utilization'], 'procurement_officer' => ['approved_requisitions', 'purchase_orders_to_issue', 'supplier_followups', 'overdue_deliveries'], 'store_keeper' => ['inventory_units', 'expected_receipts', 'open_transfers', 'low_stock_items']];
        $metrics = collect($roleMetricKeys[$role] ?? ($isManager ? $roleMetricKeys['procurement_manager'] : ($isProcurement ? $roleMetricKeys['procurement_officer'] : $roleMetricKeys['store_keeper'])))->map(fn ($key) => ['key' => $key, 'value' => $metricValues[$key] ?? 0])->values();

        $summary = ['inventoryValue' => $inventoryValue, 'inventoryUnits' => $inventoryUnits, 'lowStockItems' => (int) $stockStatus->get('Low stock'), 'outOfStockItems' => (int) $stockStatus->get('Out of stock'), 'expectedReceipts' => $expectedReceiptCount, 'receiptsToday' => (int) $movementToday->where('type', 'purchase_receipt')->count(), 'issuesToday' => (int) $movementToday->where('type', 'issue')->count(), 'transfersToday' => (int) $movementToday->where('type', 'transfer')->count(), 'adjustmentsToday' => (int) $movementToday->whereIn('type', ['add', 'remove', 'sale'])->count()];
        if ($isManager) $summary = array_merge($summary, ['spendMtd' => $monthlyTotal, 'spendYtd' => $yearlyTotal, 'openPurchaseOrderValue' => $openOrderValue, 'overdueDeliveryValue' => (float) ($orderAggregate->overdue_order_value ?? 0), 'pendingApprovalCount' => $pendingApprovalCount]);
        $supplierPerformance = $isManager ? (clone $orders)->reorder()->select('supplier_id', DB::raw('COUNT(*) as orders'), DB::raw('SUM(total_amount) as spend'), DB::raw("SUM(CASE WHEN status IN ('sent','confirmed','partial') AND expected_date IS NOT NULL AND expected_date < '".now()->toDateString()."' THEN 1 ELSE 0 END) as overdue"))->with('supplier:id,name')->groupBy('supplier_id')->orderByDesc('spend')->limit(8)->get()->map(fn ($row) => ['name' => $row->supplier?->name ?? 'Supplier', 'orders' => (int) $row->orders, 'spend' => (float) $row->spend, 'overdue' => (int) $row->overdue])->values() : collect();

        return response()->json(['generatedAt' => now()->toIso8601String(), 'metrics' => $metrics, 'summary' => $summary, 'warehouseComparison' => $warehouseComparison, 'supplierPerformance' => $supplierPerformance, 'flow' => [['stage' => 'requisition', 'count' => (clone $pendingRequests)->count(), 'delayed' => (clone $pendingRequests)->where('created_at', '<', now()->subDays(3))->count()], ['stage' => 'approval', 'count' => (clone $approvedRequests)->count(), 'delayed' => 0], ['stage' => 'purchase_order', 'count' => (clone $openOrders)->count(), 'delayed' => 0], ['stage' => 'supplier_dispatch', 'count' => (clone $orders)->whereIn('status', ['sent', 'confirmed'])->count(), 'delayed' => $overdueCount], ['stage' => 'goods_receipt', 'count' => (clone $orders)->whereIn('status', ['confirmed', 'partial'])->count(), 'delayed' => $overdueCount], ['stage' => 'inspection', 'count' => 0, 'delayed' => 0], ['stage' => 'stock_posting', 'count' => $movementRows->where('type', 'purchase_receipt')->count(), 'delayed' => 0]], 'charts' => ['purchaseOrderStatus' => collect(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'])->map(fn ($status) => ['name' => ucfirst($status), 'value' => (int) ($statusCounts[$status] ?? 0)])->values(), 'stockStatus' => $stockStatus->map(fn ($value, $name) => ['name' => $name, 'value' => (int) $value])->values(), 'stockByLocation' => $locationStock, 'movementTrend' => $movementTrend], 'workQueue' => $workQueue->values(), 'exceptions' => $exceptions, 'activity' => $activity, 'automations' => [['id' => 'low-stock', 'name' => 'Low-stock monitoring', 'description' => $lowStockProducts->count().' products at or below reorder level', 'status' => 'active', 'runsToday' => 0], ['id' => 'backup', 'name' => 'Database backup', 'description' => 'Configured backup schedule', 'status' => 'active', 'runsToday' => 0]]]);
    }

    private function accountantDashboard(Request $request): JsonResponse
    {
        $organizationId = (int) $request->user()->organization_id;
        $orders = PurchaseOrder::query()->where('organization_id', $organizationId)
            ->with(['supplier:id,name', 'warehouse:id,name', 'store:id,name'])->latest();
        $pendingApproval = (clone $orders)->where('status', 'draft');
        $approvedOrders = (clone $orders)->where('status', '!=', 'draft')->where('status', '!=', 'cancelled')->whereNotNull('approved_by');
        $unpaidOrders = (clone $approvedOrders)->whereColumn('paid_amount', '<', 'total_amount');
        $statusCounts = (clone $orders)->reorder()->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $mtdPayments = PurchaseOrderPayment::query()->whereHas('purchaseOrder', fn ($query) => $query->where('organization_id', $organizationId))->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()]);
        $unpaidRows = (clone $unpaidOrders)->limit(12)->get();
        $pendingRows = (clone $pendingApproval)->limit(8)->get();
        $outstandingValue = (float) $unpaidOrders->selectRaw('COALESCE(SUM(total_amount - paid_amount), 0) as outstanding')->value('outstanding');
        $totalOrders = (clone $orders)->count();
        $paidOrders = (clone $approvedOrders)->whereColumn('paid_amount', '>=', 'total_amount');
        $queueItem = static fn ($row, string $title, string $nextAction, string $priority, ?float $amount = null): array => [
            'id' => 'accountant-po-'.$row->id,
            'reference' => $row->po_number,
            'title' => $title,
            'supplier' => $row->supplier?->name,
            'location' => $row->warehouse?->name ?? $row->store?->name,
            'status' => $row->status,
            'priority' => $priority,
            'amount' => $amount,
            'dueAt' => $row->expected_date?->toIso8601String(),
            'nextAction' => $nextAction,
        ];
        $paymentQueue = $unpaidRows->map(fn ($row) => $queueItem($row, 'Payment verification required', 'Verify payment', 'high', max(0, (float) $row->total_amount - (float) $row->paid_amount)))->values();
        $approvalQueue = $pendingRows->map(fn ($row) => $queueItem($row, 'Waiting for manager approval', 'Await manager approval', 'normal', (float) $row->total_amount))->values();
        $activity = PurchaseOrderPayment::query()->whereHas('purchaseOrder', fn ($query) => $query->where('organization_id', $organizationId))
            ->with(['purchaseOrder:id,po_number', 'recordedBy:id,name'])->latest()->limit(8)->get()
            ->map(fn ($payment) => ['id' => 'payment-'.$payment->id, 'actor' => $payment->recordedBy?->name ?? 'Accountant', 'action' => 'verified payment', 'reference' => $payment->purchaseOrder?->po_number ?? 'Purchase order', 'occurredAt' => $payment->created_at?->toIso8601String(), 'stage' => 'stock_posting'])->values();

        return response()->json([
            'generatedAt' => now()->toIso8601String(),
            'metrics' => [
                ['key' => 'total_purchase_orders', 'value' => $totalOrders],
                ['key' => 'pending_payment_verification', 'value' => (clone $unpaidOrders)->count()],
                ['key' => 'verified_payments_mtd', 'value' => (float) $mtdPayments->sum('amount')],
                ['key' => 'outstanding_payment_value', 'value' => $outstandingValue],
            ],
            'summary' => [
                'inventoryValue' => 0, 'inventoryUnits' => 0, 'lowStockItems' => 0, 'outOfStockItems' => 0,
                'expectedReceipts' => 0, 'receiptsToday' => 0, 'issuesToday' => 0, 'transfersToday' => 0, 'adjustmentsToday' => 0,
                'totalPurchaseOrders' => $totalOrders, 'pendingManagerApprovalCount' => (clone $pendingApproval)->count(),
                'pendingPaymentVerificationCount' => (clone $unpaidOrders)->count(), 'verifiedPaymentsMtd' => (float) $mtdPayments->sum('amount'),
                'outstandingPaymentValue' => $outstandingValue,
            ],
            'warehouseComparison' => [], 'supplierPerformance' => [],
            'flow' => [
                ['stage' => 'requisition', 'count' => 0, 'delayed' => 0],
                ['stage' => 'approval', 'count' => (clone $pendingApproval)->count(), 'delayed' => 0],
                ['stage' => 'purchase_order', 'count' => (clone $approvedOrders)->count(), 'delayed' => 0],
                ['stage' => 'supplier_dispatch', 'count' => (clone $approvedOrders)->whereIn('status', ['sent', 'confirmed', 'partial'])->count(), 'delayed' => 0],
                ['stage' => 'goods_receipt', 'count' => (clone $approvedOrders)->whereIn('status', ['confirmed', 'partial'])->count(), 'delayed' => 0],
                ['stage' => 'inspection', 'count' => 0, 'delayed' => 0],
                ['stage' => 'stock_posting', 'count' => (clone $paidOrders)->count(), 'delayed' => 0],
            ],
            'charts' => [
                'purchaseOrderStatus' => collect(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'])->map(fn ($status) => ['name' => ucfirst($status), 'value' => (int) ($statusCounts[$status] ?? 0)])->values(),
                'stockStatus' => [], 'stockByLocation' => [], 'movementTrend' => [],
            ],
            'workQueue' => $paymentQueue->merge($approvalQueue)->values(),
            'exceptions' => $approvalQueue->values(),
            'activity' => $activity,
            'automations' => [],
        ]);
    }

    private function supplierDashboard(Request $request): JsonResponse
    {
        $user = $request->user(); $supplierId = (int) $user->supplier_id; $organizationId = (int) $user->organization_id; $today = now()->startOfDay();
        $orders = PurchaseOrder::query()->where('organization_id', $organizationId)->where('supplier_id', $supplierId)->with(['supplier:id,name', 'warehouse:id,name', 'store:id,name'])->latest();
        $active = (clone $orders)->whereIn('status', ['sent', 'confirmed', 'partial']); $overdue = (clone $active)->whereNotNull('expected_date')->whereDate('expected_date', '<', $today);
        $statusCounts = (clone $orders)->reorder()->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status'); $total = (clone $orders)->count(); $spend = (float) (clone $orders)->sum('total_amount');
        $workQueue = (clone $orders)->whereIn('status', ['draft', 'sent', 'confirmed', 'partial'])->limit(10)->get()->map(fn ($row) => ['id' => 'supplier-po-'.$row->id, 'reference' => $row->po_number, 'title' => $row->status === 'draft' ? 'Purchase order awaiting customer approval' : ($row->status === 'sent' ? 'Purchase order awaiting your confirmation' : 'Purchase order in delivery'), 'status' => $row->status, 'priority' => $row->expected_date?->isPast() ? 'high' : 'normal', 'amount' => (float) $row->total_amount, 'dueAt' => $row->expected_date?->toIso8601String(), 'nextAction' => 'Open purchase order'])->values();
        $activity = (clone $orders)->limit(8)->get()->map(fn ($row) => ['id' => 'supplier-activity-'.$row->id, 'actor' => 'StockFlow', 'action' => 'purchase order '.$row->status, 'reference' => $row->po_number, 'occurredAt' => $row->updated_at?->toIso8601String(), 'stage' => 'purchase_order'])->values();
        return response()->json([
            'generatedAt' => now()->toIso8601String(), 'metrics' => [['key' => 'supplier_total_orders', 'value' => $total], ['key' => 'supplier_open_orders', 'value' => (clone $active)->count()], ['key' => 'supplier_order_value', 'value' => $spend], ['key' => 'supplier_overdue_orders', 'value' => $overdue->count()]],
            'summary' => ['inventoryValue' => 0, 'inventoryUnits' => 0, 'lowStockItems' => 0, 'outOfStockItems' => 0, 'expectedReceipts' => 0, 'receiptsToday' => 0, 'issuesToday' => 0, 'transfersToday' => 0, 'adjustmentsToday' => 0, 'totalPurchaseOrders' => $total, 'openPurchaseOrderValue' => (float) (clone $active)->sum('total_amount'), 'overdueDeliveryValue' => (float) $overdue->sum('total_amount')],
            'warehouseComparison' => [], 'supplierPerformance' => [], 'flow' => [['stage' => 'requisition', 'count' => 0, 'delayed' => 0], ['stage' => 'approval', 'count' => 0, 'delayed' => 0], ['stage' => 'purchase_order', 'count' => $total, 'delayed' => 0], ['stage' => 'supplier_dispatch', 'count' => (clone $active)->count(), 'delayed' => $overdue->count()], ['stage' => 'goods_receipt', 'count' => 0, 'delayed' => 0], ['stage' => 'inspection', 'count' => 0, 'delayed' => 0], ['stage' => 'stock_posting', 'count' => 0, 'delayed' => 0]],
            'charts' => ['purchaseOrderStatus' => collect(['sent', 'confirmed', 'partial', 'received', 'cancelled'])->map(fn ($status) => ['name' => ucfirst($status), 'value' => (int) ($statusCounts[$status] ?? 0)])->values(), 'stockStatus' => [], 'stockByLocation' => [], 'movementTrend' => []],
            'workQueue' => $workQueue, 'exceptions' => $workQueue->filter(fn ($row) => $row['priority'] === 'high')->values(), 'activity' => $activity, 'automations' => [],
        ]);
    }

    private function departmentDashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $organizationId = (int) $user->organization_id;
        $department = Department::with('branch:id,name')
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->find($user->department_id);

        $baseSummary = [
            'inventoryValue' => 0, 'inventoryUnits' => 0, 'lowStockItems' => 0, 'outOfStockItems' => 0,
            'expectedReceipts' => 0, 'receiptsToday' => 0, 'issuesToday' => 0, 'transfersToday' => 0, 'adjustmentsToday' => 0,
            'departmentTotalOrders' => 0, 'departmentPendingOrders' => 0, 'departmentApprovedOrders' => 0,
            'departmentOpenPurchaseOrders' => 0, 'departmentReceivedOrders' => 0, 'departmentCommittedSpend' => 0,
            'departmentOverdueCount' => 0,
        ];
        $emptyFlow = [
            ['stage' => 'requisition', 'count' => 0, 'delayed' => 0], ['stage' => 'approval', 'count' => 0, 'delayed' => 0],
            ['stage' => 'purchase_order', 'count' => 0, 'delayed' => 0], ['stage' => 'supplier_dispatch', 'count' => 0, 'delayed' => 0],
            ['stage' => 'goods_receipt', 'count' => 0, 'delayed' => 0], ['stage' => 'inspection', 'count' => 0, 'delayed' => 0],
            ['stage' => 'stock_posting', 'count' => 0, 'delayed' => 0],
        ];
        $empty = [
            'generatedAt' => now()->toIso8601String(),
            'department' => $department ? ['id' => (string) $department->id, 'name' => $department->name, 'code' => $department->code, 'branch' => $department->branch?->name] : null,
            'metrics' => [
                ['key' => 'department_total_orders', 'value' => 0], ['key' => 'department_pending_orders', 'value' => 0],
                ['key' => 'department_open_purchase_orders', 'value' => 0], ['key' => 'department_committed_spend', 'value' => 0],
            ],
            'summary' => $baseSummary, 'warehouseComparison' => [], 'supplierPerformance' => [], 'flow' => $emptyFlow,
            'charts' => ['purchaseOrderStatus' => [], 'stockStatus' => [], 'stockByLocation' => [], 'movementTrend' => []],
            'workQueue' => [], 'exceptions' => [], 'activity' => [], 'automations' => [],
        ];
        if (! $department) return response()->json($empty);

        $orders = ReplenishmentRequest::query()->where('organization_id', $organizationId)->where('department_id', $department->id);
        $purchaseOrders = PurchaseOrder::query()->where('organization_id', $organizationId)->where('department_id', $department->id);
        $openStatuses = ['draft', 'sent', 'confirmed', 'partial'];
        $dispatchStatuses = ['sent', 'confirmed', 'partial'];
        $today = now()->startOfDay();
        $overdueOrders = (clone $purchaseOrders)->whereIn('status', $dispatchStatuses)->whereNotNull('expected_date')->whereDate('expected_date', '<', $today);
        $pendingOrders = (clone $orders)->where('status', 'pending');
        $approvedOrders = (clone $orders)->where('status', 'approved');
        $openPurchaseOrders = (clone $purchaseOrders)->whereIn('status', $openStatuses);
        $receivedPurchaseOrders = (clone $purchaseOrders)->where('status', 'received');

        $totalOrders = (clone $orders)->count();
        $pendingCount = (clone $pendingOrders)->count();
        $approvedCount = (clone $approvedOrders)->count();
        $openPurchaseOrderCount = (clone $openPurchaseOrders)->count();
        $receivedCount = (clone $receivedPurchaseOrders)->count();
        $committedSpend = (float) (clone $purchaseOrders)->where('status', '!=', 'cancelled')->sum('total_amount');
        $overdueCount = (clone $overdueOrders)->count();

        $orderRows = (clone $orders)->with(['product:id,name,sku', 'warehouse:id,name', 'requester:id,name'])->latest()->limit(8)->get();
        $poRows = (clone $purchaseOrders)->with(['supplier:id,name', 'warehouse:id,name', 'store:id,name'])->latest()->limit(8)->get();
        $item = static fn (string $id, string $reference, string $title, string $status, string $priority = 'normal', ?string $location = null, ?string $supplier = null, ?float $amount = null, ?string $dueAt = null, ?string $nextAction = null): array => compact('id', 'reference', 'title', 'status', 'priority', 'location', 'supplier', 'amount', 'dueAt', 'nextAction');
        $pendingQueue = $orderRows->filter(fn ($row) => $row->status === 'pending')->map(fn ($row) => $item('department-order-'.$row->id, $row->reference, 'Department order: '.($row->product?->name ?? 'Item'), $row->status, $row->created_at?->lt(now()->subDays(3)) ? 'high' : 'normal', $row->warehouse?->name, null, null, $row->created_at?->copy()->addDays(3)->toIso8601String(), 'Open department orders'))->values();
        $approvedQueue = $orderRows->filter(fn ($row) => $row->status === 'approved')->map(fn ($row) => $item('department-approved-'.$row->id, $row->reference, 'Approved department order: '.($row->product?->name ?? 'Item'), $row->status, 'normal', $row->warehouse?->name, null, null, null, 'Track procurement'))->values();
        $purchaseQueue = $poRows->filter(fn ($row) => in_array($row->status, $openStatuses, true))->map(fn ($row) => $item('department-po-'.$row->id, $row->po_number, 'Department purchase order', $row->status, $row->expected_date?->isPast() && $row->expected_date?->lt(today()) ? 'high' : 'normal', $row->warehouse?->name ?? $row->store?->name, $row->supplier?->name, (float) $row->total_amount, $row->expected_date?->toIso8601String(), $row->status === 'draft' ? 'Await procurement approval' : ($row->status === 'sent' ? 'Await supplier response' : 'Monitor delivery')))->values();
        $overdueQueue = $poRows->filter(fn ($row) => in_array($row->status, $dispatchStatuses, true) && $row->expected_date?->isPast() && $row->expected_date?->lt(today()))->map(fn ($row) => $item('department-overdue-'.$row->id, $row->po_number, 'Department delivery overdue', $row->status, 'high', $row->warehouse?->name ?? $row->store?->name, $row->supplier?->name, (float) $row->total_amount, $row->expected_date?->toIso8601String(), 'Follow up procurement'))->values();

        $activity = $orderRows->map(fn ($row) => ['id' => 'department-order-'.$row->id, 'actor' => $row->requester?->name ?? 'Department', 'action' => 'submitted departmental order', 'reference' => $row->reference, 'occurredAt' => $row->created_at?->toIso8601String(), 'stage' => $row->status === 'approved' ? 'approval' : 'requisition'])->merge($poRows->map(fn ($row) => ['id' => 'department-po-'.$row->id, 'actor' => 'Procurement', 'action' => 'updated department purchase order', 'reference' => $row->po_number, 'occurredAt' => $row->updated_at?->toIso8601String(), 'stage' => in_array($row->status, $dispatchStatuses, true) ? 'supplier_dispatch' : 'purchase_order']))->sortByDesc('occurredAt')->take(8)->values();
        $statusCounts = (clone $purchaseOrders)->reorder()->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');

        $summary = array_merge($baseSummary, ['departmentName' => $department->name, 'departmentCode' => $department->code, 'departmentBranch' => $department->branch?->name, 'departmentTotalOrders' => $totalOrders, 'departmentPendingOrders' => $pendingCount, 'departmentApprovedOrders' => $approvedCount, 'departmentOpenPurchaseOrders' => $openPurchaseOrderCount, 'departmentReceivedOrders' => $receivedCount, 'departmentCommittedSpend' => $committedSpend, 'departmentOverdueCount' => $overdueCount]);
        return response()->json([
            'generatedAt' => now()->toIso8601String(),
            'department' => ['id' => (string) $department->id, 'name' => $department->name, 'code' => $department->code, 'branch' => $department->branch?->name],
            'metrics' => [['key' => 'department_total_orders', 'value' => $totalOrders], ['key' => 'department_pending_orders', 'value' => $pendingCount], ['key' => 'department_open_purchase_orders', 'value' => $openPurchaseOrderCount], ['key' => 'department_committed_spend', 'value' => $committedSpend]],
            'summary' => $summary, 'warehouseComparison' => [], 'supplierPerformance' => [],
            'flow' => [
                ['stage' => 'requisition', 'count' => $totalOrders, 'delayed' => (clone $pendingOrders)->where('created_at', '<', now()->subDays(3))->count()],
                ['stage' => 'approval', 'count' => $approvedCount, 'delayed' => 0], ['stage' => 'purchase_order', 'count' => $openPurchaseOrderCount, 'delayed' => 0],
                ['stage' => 'supplier_dispatch', 'count' => (clone $purchaseOrders)->whereIn('status', $dispatchStatuses)->count(), 'delayed' => $overdueCount],
                ['stage' => 'goods_receipt', 'count' => $receivedCount, 'delayed' => 0], ['stage' => 'inspection', 'count' => 0, 'delayed' => 0], ['stage' => 'stock_posting', 'count' => 0, 'delayed' => 0],
            ],
            'charts' => ['purchaseOrderStatus' => collect(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'])->map(fn ($status) => ['name' => ucfirst($status), 'value' => (int) ($statusCounts[$status] ?? 0)])->values(), 'stockStatus' => [], 'stockByLocation' => [], 'movementTrend' => []],
            'workQueue' => $pendingQueue->merge($approvedQueue)->merge($purchaseQueue)->sortByDesc(fn ($row) => $row['priority'] === 'high')->take(12)->values(),
            'exceptions' => $overdueQueue->merge($pendingQueue->filter(fn ($row) => $row['priority'] === 'high'))->values(),
            'activity' => $activity, 'automations' => [],
        ]);
    }
}
