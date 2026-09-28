<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{DB, Schema};

class ReportController extends Controller
{
    private const TEMPLATES = [
        ['key' => 'profit-loss', 'name' => 'Profit & Loss Report', 'description' => 'Revenue, cost of goods sold, expenses and net profit.'],
        ['key' => 'purchases', 'name' => 'Purchase Report', 'description' => 'Purchase orders raised during the selected period.'],
        ['key' => 'purchase-returns', 'name' => 'Purchase Return Report', 'description' => 'Items returned to suppliers.'],
        ['key' => 'purchase-payments', 'name' => 'Purchase Payments Report', 'description' => 'Supplier payment activity and outstanding balances.'],
        ['key' => 'item-sales', 'name' => 'Item Sales Report', 'description' => 'Quantity and revenue performance by item.'],
        ['key' => 'item-purchases', 'name' => 'Item Purchase Report', 'description' => 'Purchased quantity and cost by item.', 'is_new' => true],
        ['key' => 'sales', 'name' => 'Sales Report', 'description' => 'Completed sales, discounts, tax and revenue.'],
        ['key' => 'sales-returns', 'name' => 'Sales Return Report', 'description' => 'Returned items and customer refunds.'],
        ['key' => 'sales-payments', 'name' => 'Sales Payments Report', 'description' => 'Collections grouped by payment method.'],
        ['key' => 'stock', 'name' => 'Stock Report', 'description' => 'Current product catalog, pricing and stock status.'],
        ['key' => 'expenses', 'name' => 'Expense Report', 'description' => 'Operating expenses by category.'],
        ['key' => 'expired-items', 'name' => 'Expired Items Report', 'description' => 'Expired batches requiring action.'],
    ];

    public function templates(): JsonResponse
    {
        return response()->json(self::TEMPLATES);
    }

    public function show(Request $request, string $report): JsonResponse
    {
        $template = collect(self::TEMPLATES)->firstWhere('key', $report);
        abort_unless($template, 404, 'Unknown report template.');
        $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from']]);
        $organizationId = (int) $request->user()->organization_id;
        $from = $request->input('from');
        $to = $request->input('to');
        $result = match ($report) {
            'stock' => $this->stock($organizationId),
            'purchases' => $this->purchases($organizationId, $from, $to),
            'item-purchases' => $this->itemPurchases($organizationId, $from, $to),
            'purchase-payments' => $this->purchasePayments($organizationId, $from, $to),
            'profit-loss' => $this->profitAndLoss(),
            default => $this->transactionalFallback($report, $organizationId, $from, $to),
        };

        return response()->json(array_merge($template, $result, [
            'currency' => DB::table('organizations')->where('id', $organizationId)->value('currency') ?? 'TSHS',
            'generated_at' => now()->toIso8601String(),
            'filters' => ['from' => $from, 'to' => $to],
        ]));
    }

    private function stock(int $organizationId): array
    {
        $hasBalances = Schema::hasTable('stock_balances');
        $balanceQuery = $hasBalances
            ? DB::table('stock_balances')->where('organization_id', $organizationId)->select('product_id', DB::raw('SUM(quantity) as quantity'))->groupBy('product_id')
            : null;
        $products = DB::table('products')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->leftJoin('units', 'units.id', '=', 'products.unit_id')
            ->when($balanceQuery, fn ($query) => $query->leftJoinSub($balanceQuery, 'balances', 'balances.product_id', '=', 'products.id'))
            ->where('products.organization_id', $organizationId)
            ->select(['products.id', 'products.sku', 'products.name', 'categories.name as category', 'units.abbreviation as unit', 'products.cost_price', 'products.selling_price', 'products.reorder_level', 'products.is_active'])
            ->when($balanceQuery, fn ($query) => $query->addSelect(DB::raw('COALESCE(balances.quantity, 0) as quantity')))
            ->orderBy('products.name')->get();

        $rows = $products->map(function ($product): array {
            $quantity = (float) ($product->quantity ?? 0);
            $costPrice = (float) $product->cost_price;
            $sellingPrice = (float) $product->selling_price;
            $reorderLevel = (float) $product->reorder_level;
            return [
                'sku' => $product->sku, 'product' => $product->name, 'category' => $product->category ?? 'Uncategorized', 'unit' => $product->unit ?? '—',
                'quantity' => $quantity, 'reorder_level' => $reorderLevel, 'cost_price' => $costPrice, 'selling_price' => $sellingPrice,
                'cost_value' => $quantity * $costPrice, 'retail_value' => $quantity * $sellingPrice,
                'status' => ! $product->is_active ? 'Inactive' : ($quantity <= 0 ? 'Out of stock' : ($quantity <= $reorderLevel ? 'Low stock' : 'In stock')),
            ];
        })->values();

        return [
            'available' => true,
            'source_note' => $hasBalances ? 'Live stock ledger balances and current product master data.' : 'The stock ledger is not installed; quantities are reported as zero from the live product catalog.',
            'columns' => [
                ['key' => 'sku', 'label' => 'SKU'], ['key' => 'product', 'label' => 'Product'], ['key' => 'category', 'label' => 'Category'], ['key' => 'unit', 'label' => 'Unit'],
                ['key' => 'quantity', 'label' => 'Quantity', 'format' => 'number'], ['key' => 'reorder_level', 'label' => 'Reorder Level', 'format' => 'number'],
                ['key' => 'cost_price', 'label' => 'Cost Price', 'format' => 'currency'], ['key' => 'selling_price', 'label' => 'Selling Price', 'format' => 'currency'],
                ['key' => 'cost_value', 'label' => 'Cost Value', 'format' => 'currency'], ['key' => 'retail_value', 'label' => 'Retail Value', 'format' => 'currency'], ['key' => 'status', 'label' => 'Status'],
            ],
            'rows' => $rows,
            'kpis' => [
                ['label' => 'Products', 'value' => $products->count(), 'format' => 'number'], ['label' => 'Units in Stock', 'value' => $rows->sum('quantity'), 'format' => 'number'],
                ['label' => 'Cost Value', 'value' => $rows->sum('cost_value'), 'format' => 'currency'], ['label' => 'Retail Value', 'value' => $rows->sum('retail_value'), 'format' => 'currency'],
            ],
            'chart' => $rows->groupBy('category')->map(fn ($items, $name) => ['name' => $name, 'value' => $items->count()])->values(),
        ];
    }

    private function purchases(int $organizationId, ?string $from, ?string $to): array
    {
        $query = DB::table('purchase_orders')
            ->leftJoin('suppliers', 'suppliers.id', '=', 'purchase_orders.supplier_id')
            ->leftJoin('warehouses', 'warehouses.id', '=', 'purchase_orders.warehouse_id')
            ->leftJoin('stores', 'stores.id', '=', 'purchase_orders.store_id')
            ->where('purchase_orders.organization_id', $organizationId);
        $this->applyDateRange($query, 'purchase_orders.created_at', $from, $to);
        $rows = (clone $query)->select(['purchase_orders.po_number', 'purchase_orders.status', 'purchase_orders.created_at', 'purchase_orders.expected_date', 'suppliers.name as supplier', DB::raw("COALESCE(warehouses.name, stores.name, '-') as destination"), 'purchase_orders.subtotal', 'purchase_orders.tax_amount', 'purchase_orders.total_amount', 'purchase_orders.paid_amount'])->orderByDesc('purchase_orders.created_at')->limit(1000)->get()->map(fn ($row) => [
            'po_number' => $row->po_number, 'supplier' => $row->supplier ?? '—', 'destination' => $row->destination, 'status' => ucfirst((string) $row->status), 'order_date' => $row->created_at, 'expected_date' => $row->expected_date,
            'subtotal' => (float) $row->subtotal, 'tax_amount' => (float) $row->tax_amount, 'total_amount' => (float) $row->total_amount, 'paid_amount' => (float) $row->paid_amount, 'outstanding' => max(0, (float) $row->total_amount - (float) $row->paid_amount),
        ])->values();
        $summary = (clone $query)->selectRaw('COUNT(*) as records, COALESCE(SUM(total_amount), 0) as total, COALESCE(SUM(paid_amount), 0) as paid')->first();
        $statusBreakdown = (clone $query)->reorder()->select('purchase_orders.status')->selectRaw('COUNT(*) as total')->groupBy('purchase_orders.status')->orderByDesc('total')->get();
        $total = (float) ($summary->total ?? 0); $paid = (float) ($summary->paid ?? 0);
        return [
            'available' => true, 'source_note' => 'Live purchase orders from the procurement ledger. Date filters use the purchase-order creation date because this installation does not have a separate order_date field.',
            'columns' => [
                ['key' => 'po_number', 'label' => 'PO Number'], ['key' => 'supplier', 'label' => 'Supplier'], ['key' => 'destination', 'label' => 'Destination'], ['key' => 'status', 'label' => 'Status'],
                ['key' => 'order_date', 'label' => 'Order Date', 'format' => 'date'], ['key' => 'expected_date', 'label' => 'Expected Date', 'format' => 'date'],
                ['key' => 'subtotal', 'label' => 'Subtotal', 'format' => 'currency'], ['key' => 'tax_amount', 'label' => 'Tax', 'format' => 'currency'], ['key' => 'total_amount', 'label' => 'Total', 'format' => 'currency'], ['key' => 'paid_amount', 'label' => 'Paid', 'format' => 'currency'], ['key' => 'outstanding', 'label' => 'Outstanding', 'format' => 'currency'],
            ],
            'rows' => $rows,
            'kpis' => [
                ['label' => 'Purchase Orders', 'value' => (int) ($summary->records ?? 0), 'format' => 'number'], ['label' => 'Committed Spend', 'value' => $total, 'format' => 'currency'], ['label' => 'Paid', 'value' => $paid, 'format' => 'currency'], ['label' => 'Outstanding', 'value' => max(0, $total - $paid), 'format' => 'currency'],
            ],
            'chart' => $statusBreakdown->map(fn ($row) => ['name' => ucfirst((string) $row->status), 'value' => (int) $row->total])->values(),
        ];
    }

    private function itemPurchases(int $organizationId, ?string $from, ?string $to): array
    {
        $query = DB::table('purchase_order_items')->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')->leftJoin('products', 'products.id', '=', 'purchase_order_items.product_id')->where('purchase_orders.organization_id', $organizationId);
        $this->applyDateRange($query, 'purchase_orders.created_at', $from, $to);
        $rows = (clone $query)->select(['purchase_orders.po_number', 'purchase_orders.status', 'purchase_orders.created_at', 'products.sku', 'products.name as product', 'purchase_order_items.ordered_qty', 'purchase_order_items.received_qty', 'purchase_order_items.unit_cost', 'purchase_order_items.total'])->orderByDesc('purchase_orders.created_at')->limit(1000)->get()->map(fn ($row) => [
            'po_number' => $row->po_number, 'product' => $row->product ?? '—', 'sku' => $row->sku ?? '—', 'status' => ucfirst((string) $row->status), 'order_date' => $row->created_at, 'ordered_qty' => (float) $row->ordered_qty, 'received_qty' => (float) $row->received_qty, 'unit_cost' => (float) $row->unit_cost, 'total' => (float) $row->total,
        ])->values();
        $summary = (clone $query)->selectRaw('COUNT(*) as records, COALESCE(SUM(purchase_order_items.ordered_qty), 0) as ordered_qty, COALESCE(SUM(purchase_order_items.received_qty), 0) as received_qty, COALESCE(SUM(purchase_order_items.total), 0) as total')->first();
        return [
            'available' => true, 'source_note' => 'Live purchase-order item lines joined to the current product catalog.',
            'columns' => [
                ['key' => 'po_number', 'label' => 'PO Number'], ['key' => 'product', 'label' => 'Product'], ['key' => 'sku', 'label' => 'SKU'], ['key' => 'status', 'label' => 'Status'], ['key' => 'order_date', 'label' => 'Order Date', 'format' => 'date'],
                ['key' => 'ordered_qty', 'label' => 'Ordered Qty', 'format' => 'number'], ['key' => 'received_qty', 'label' => 'Received Qty', 'format' => 'number'], ['key' => 'unit_cost', 'label' => 'Unit Cost', 'format' => 'currency'], ['key' => 'total', 'label' => 'Line Total', 'format' => 'currency'],
            ],
            'rows' => $rows,
            'kpis' => [
                ['label' => 'Line Items', 'value' => (int) ($summary->records ?? 0), 'format' => 'number'], ['label' => 'Ordered Units', 'value' => (float) ($summary->ordered_qty ?? 0), 'format' => 'number'], ['label' => 'Received Units', 'value' => (float) ($summary->received_qty ?? 0), 'format' => 'number'], ['label' => 'Line Value', 'value' => (float) ($summary->total ?? 0), 'format' => 'currency'],
            ],
            'chart' => [],
        ];
    }

    private function purchasePayments(int $organizationId, ?string $from, ?string $to): array
    {
        $query = DB::table('purchase_order_payments')->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_payments.purchase_order_id')->leftJoin('users', 'users.id', '=', 'purchase_order_payments.recorded_by')->where('purchase_orders.organization_id', $organizationId);
        $this->applyDateRange($query, 'purchase_order_payments.created_at', $from, $to);
        $rows = (clone $query)->select(['purchase_order_payments.created_at', 'purchase_orders.po_number', 'purchase_orders.status', 'users.name as recorded_by', 'purchase_order_payments.amount'])->orderByDesc('purchase_order_payments.created_at')->limit(1000)->get()->map(fn ($row) => [
            'payment_date' => $row->created_at, 'po_number' => $row->po_number, 'status' => ucfirst((string) $row->status), 'recorded_by' => $row->recorded_by ?? 'System', 'amount' => (float) $row->amount,
        ])->values();
        $summary = (clone $query)->selectRaw('COUNT(*) as records, COALESCE(SUM(purchase_order_payments.amount), 0) as total, COALESCE(AVG(purchase_order_payments.amount), 0) as average')->first();
        $outstandingQuery = DB::table('purchase_orders')->where('organization_id', $organizationId); $this->applyDateRange($outstandingQuery, 'created_at', $from, $to);
        $outstanding = (float) $outstandingQuery->selectRaw('COALESCE(SUM(total_amount - paid_amount), 0) as outstanding')->value('outstanding');
        return [
            'available' => true, 'source_note' => 'Live supplier payment records joined to the purchase-order ledger.',
            'columns' => [['key' => 'payment_date', 'label' => 'Payment Date', 'format' => 'date'], ['key' => 'po_number', 'label' => 'PO Number'], ['key' => 'status', 'label' => 'PO Status'], ['key' => 'recorded_by', 'label' => 'Recorded By'], ['key' => 'amount', 'label' => 'Amount', 'format' => 'currency']],
            'rows' => $rows,
            'kpis' => [['label' => 'Payments', 'value' => (int) ($summary->records ?? 0), 'format' => 'number'], ['label' => 'Paid in Period', 'value' => (float) ($summary->total ?? 0), 'format' => 'currency'], ['label' => 'Average Payment', 'value' => (float) ($summary->average ?? 0), 'format' => 'currency'], ['label' => 'Current Outstanding', 'value' => max(0, $outstanding), 'format' => 'currency']],
            'chart' => [],
        ];
    }

    private function profitAndLoss(): array
    {
        $missing = collect(['sales', 'sale_items', 'expenses'])->reject(fn ($table) => Schema::hasTable($table))->values();
        return $missing->isNotEmpty()
            ? $this->unavailable('Profit and loss requires completed sales, cost-of-goods and expense ledgers.', $missing->all(), [['label' => 'Revenue', 'value' => 0, 'format' => 'currency'], ['label' => 'Cost of Goods', 'value' => 0, 'format' => 'currency'], ['label' => 'Expenses', 'value' => 0, 'format' => 'currency'], ['label' => 'Net Profit', 'value' => 0, 'format' => 'currency']])
            : $this->unavailable('The accounting report schema is present but is not configured for this installation yet.', [], []);
    }

    private function transactionalFallback(string $report, int $organizationId, ?string $from, ?string $to): array
    {
        $map = ['sales' => ['sales', 'sale_date'], 'item-sales' => ['sale_items', 'created_at'], 'sales-returns' => ['sale_returns', 'created_at'], 'sales-payments' => ['sale_payments', 'created_at'], 'purchase-returns' => ['purchase_returns', 'created_at'], 'expenses' => ['expenses', 'expense_date'], 'expired-items' => ['stock_batches', 'expiry_date']];
        [$table, $preferredDateColumn] = $map[$report] ?? ['', 'created_at'];
        if (! $table || ! Schema::hasTable($table)) return $this->unavailable("The {$table} operational ledger has not been installed yet.", [$table], [['label' => 'Records', 'value' => 0, 'format' => 'number'], ['label' => 'Total Value', 'value' => 0, 'format' => 'currency'], ['label' => 'Average Value', 'value' => 0, 'format' => 'currency'], ['label' => 'Period Activity', 'value' => 0, 'format' => 'number']]);
        $dateColumn = Schema::hasColumn($table, $preferredDateColumn) ? $preferredDateColumn : (Schema::hasColumn($table, 'created_at') ? 'created_at' : 'id');
        $query = DB::table($table);
        if (Schema::hasColumn($table, 'organization_id')) $query->where("{$table}.organization_id", $organizationId);
        $this->applyDateRange($query, "{$table}.{$dateColumn}", $from, $to, $dateColumn !== 'id');
        $rows = (clone $query)->orderByDesc($dateColumn)->limit(1000)->get()->map(fn ($row) => (array) $row)->values();
        $columns = $rows->first() ? collect(array_keys($rows->first()))->map(fn ($key) => ['key' => $key, 'label' => str($key)->replace('_', ' ')->title()->toString()])->values() : [];
        return ['available' => true, 'source_note' => "Live {$table} operational records. Showing the latest 1,000 records for safe browser rendering.", 'columns' => $columns, 'rows' => $rows, 'kpis' => [['label' => 'Records', 'value' => $query->count(), 'format' => 'number'], ['label' => 'Displayed', 'value' => $rows->count(), 'format' => 'number'], ['label' => 'From', 'value' => $from ?? 'All time', 'format' => 'text'], ['label' => 'To', 'value' => $to ?? 'Today', 'format' => 'text']], 'chart' => []];
    }

    private function applyDateRange($query, string $column, ?string $from, ?string $to, bool $dateColumnExists = true): void
    {
        if (! $dateColumnExists) return;
        if ($from) $query->whereDate($column, '>=', $from);
        if ($to) $query->whereDate($column, '<=', $to);
    }

    private function unavailable(string $sourceNote, array $missingSources, array $kpis): array
    {
        return ['available' => false, 'source_note' => $sourceNote, 'missing_sources' => array_values(array_filter($missingSources)), 'columns' => [], 'rows' => [], 'kpis' => $kpis, 'chart' => []];
    }
}
