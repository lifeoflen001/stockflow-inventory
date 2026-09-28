<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Department, Product, PurchaseOrder, PurchaseOrderComment, PurchaseOrderDocument, PurchaseOrderItem, PurchaseOrderPayment, StockBalance, StockMovement, Store, Supplier, Warehouse};
use App\Services\NotificationService;
use App\Services\MailDeliveryService;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PurchaseOrderController extends Controller
{
    public function index(Request $request, NotificationService $notifications): JsonResponse
    {
        if ($request->user()->hasPermission('purchase_orders.approve')) {
            $notifications->notifyPendingPurchaseOrderApprovals($this->org($request));
        }
        $query = PurchaseOrder::with(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code'])
            ->where('organization_id', $this->org($request));
        if ($this->isSupplier($request)) $query->where('supplier_id', $request->user()->supplier_id);
        return response()->json($query->latest()->get()->map(fn (PurchaseOrder $order) => $this->isSupplier($request) ? $this->supplierPayload($order) : $this->payload($order)));
    }

    public function show(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $purchaseOrder->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code', 'items.product:id,name,sku', 'payments.recordedBy:id,name', 'documents.uploadedBy:id,name', 'comments.user:id,name']);
        return response()->json($this->isSupplier($request) ? $this->supplierPayload($purchaseOrder) : $this->payload($purchaseOrder));
    }

    public function updateProfile(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        abort_unless(in_array($request->user()->primaryRole(), ['super_admin', 'procurement_manager', 'procurement_officer'], true), 403, 'Only procurement officers, procurement managers and super administrators can edit PO details.');
        $data = $request->validate([
            'purchaseReason' => ['nullable', 'string', 'max:5000'],
            'allocation' => ['nullable', 'string', 'max:5000'],
            'allocationDepartmentId' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('organization_id', (int) $request->user()->organization_id)->where('is_active', true)],
        ]);
        if (! empty($data['allocationDepartmentId'])) {
            $data['allocation'] = Department::where('organization_id', $this->org($request))->findOrFail($data['allocationDepartmentId'])->name;
        }
        $purchaseOrder->update([
            'purchase_reason' => array_key_exists('purchaseReason', $data) ? trim((string) $data['purchaseReason']) : $purchaseOrder->purchase_reason,
            'allocation' => array_key_exists('allocation', $data) ? trim((string) $data['allocation']) : $purchaseOrder->allocation,
            'department_id' => array_key_exists('allocationDepartmentId', $data) ? ($data['allocationDepartmentId'] ?: null) : $purchaseOrder->department_id,
        ]);
        return response()->json($this->payload($purchaseOrder->fresh()->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code', 'items.product:id,name,sku', 'payments.recordedBy:id,name', 'payments.proofOfPayment', 'documents.uploadedBy:id,name', 'comments.user:id,name'])));
    }

    public function uploadDocument(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $this->assertCanManageRecords($request);
        $data = $request->validate([
            'type' => ['required', Rule::in(['receipt', 'invoice'])],
            'title' => ['nullable', 'string', 'max:255'],
            'file' => ['required', 'file', 'max:25600', 'mimes:jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt'],
        ]);
        $file = $request->file('file');
        $path = $file->storeAs('purchase-orders/'.$purchaseOrder->organization_id.'/'.$purchaseOrder->id, Str::uuid().'.'.$file->getClientOriginalExtension(), 'local');
        $document = $purchaseOrder->documents()->create([
            'uploaded_by' => $request->user()->id,
            'type' => $data['type'],
            'title' => trim($data['title'] ?? '') ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_name' => $file->getClientOriginalName(),
            'disk' => 'local',
            'path' => $path,
            'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
            'size' => $file->getSize(),
        ]);
        return response()->json($this->documentPayload($document->load('uploadedBy:id,name')), 201);
    }

    public function downloadDocument(Request $request, PurchaseOrder $purchaseOrder, PurchaseOrderDocument $document)
    {
        $this->owned($request, $purchaseOrder);
        abort_unless($document->purchase_order_id === $purchaseOrder->id, 404);
        abort_if($this->isSupplier($request) && $document->type === 'proof_of_payment', 404);
        abort_unless(Storage::disk($document->disk)->exists($document->path), 404);
        return Storage::disk($document->disk)->download($document->path, $document->original_name, ['Content-Type' => $document->mime_type]);
    }

    public function destroyDocument(Request $request, PurchaseOrder $purchaseOrder, PurchaseOrderDocument $document): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $this->assertCanManageRecords($request);
        abort_unless($document->purchase_order_id === $purchaseOrder->id, 404);
        Storage::disk($document->disk)->delete($document->path);
        $document->delete();
        return response()->json(['deleted' => true]);
    }

    public function storeComment(Request $request, PurchaseOrder $purchaseOrder, NotificationService $notifications): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $comment = $purchaseOrder->comments()->create(['user_id' => $request->user()->id, 'body' => trim($data['body'])]);
        $notifications->notifyPurchaseOrderComment($purchaseOrder, $comment);
        return response()->json($this->commentPayload($comment->load('user:id,name')), 201);
    }

    public function supplierStats(Request $request, int $supplierId): JsonResponse
    {
        $org = $this->org($request);
        $supplier = Supplier::where('organization_id', $org)->findOrFail($supplierId);
        $summary = PurchaseOrder::where('organization_id', $org)
            ->where('supplier_id', $supplier->id)
            ->selectRaw('COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_spend, COALESCE(SUM(paid_amount), 0) as total_paid')
            ->first();

        $totalSpend = (float) ($summary->total_spend ?? 0);
        $totalPaid = (float) ($summary->total_paid ?? 0);

        return response()->json([
            'totalOrders' => (int) ($summary->total_orders ?? 0),
            'totalSpend' => $totalSpend,
            'totalPaid' => $totalPaid,
            'outstanding' => max(0, $totalSpend - $totalPaid),
        ]);
    }

    public function store(Request $request, NotificationService $notifications, MailDeliveryService $delivery): JsonResponse
    {
        $data = $request->validate([
            'supplierId' => ['required', 'integer'],
            'warehouseId' => ['nullable', 'integer'], 'storeId' => ['nullable', 'integer'],
            'locationType' => ['nullable', Rule::in(['warehouse', 'store'])], 'locationId' => ['nullable', 'integer'],
            'expectedDate' => ['nullable', 'date'], 'notes' => ['nullable', 'string', 'max:5000'],
            'purchaseReason' => ['nullable', 'string', 'max:5000'], 'allocation' => ['nullable', 'string', 'max:5000'],
            'allocationDepartmentId' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('organization_id', (int) $request->user()->organization_id)->where('is_active', true)],
            'collectedBy' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'], 'items.*.productId' => ['required', 'integer', 'distinct'],
            'items.*.orderedQty' => ['required', 'numeric', 'gt:0'], 'items.*.unitCost' => ['required', 'numeric', 'min:0'],
            'items.*.taxRate' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);
        $org = $this->org($request);
        if (! empty($data['allocationDepartmentId'])) {
            $data['allocation'] = Department::where('organization_id', $org)->findOrFail($data['allocationDepartmentId'])->name;
        }
        $supplier = Supplier::where('organization_id', $org)->where('is_active', true)->findOrFail($data['supplierId']);
        $locationType = $data['locationType'] ?? (! empty($data['storeId']) ? 'store' : 'warehouse');
        $locationId = $data['locationId'] ?? ($locationType === 'store' ? ($data['storeId'] ?? null) : ($data['warehouseId'] ?? null));
        abort_unless($locationId, 422, 'Select a store or warehouse for this purchase order.');
        $warehouse = $locationType === 'warehouse'
            ? Warehouse::where('organization_id', $org)->where('is_active', true)->findOrFail($locationId)
            : null;
        $store = $locationType === 'store'
            ? Store::where('organization_id', $org)->where('is_active', true)->findOrFail($locationId)
            : null;
        $productIds = collect($data['items'])->pluck('productId')->all();
        abort_unless(Product::where('organization_id', $org)->where('is_active', true)->whereIn('id', $productIds)->count() === count($productIds), 422, 'One or more products are unavailable.');

        $order = DB::transaction(function () use ($data, $org, $request, $supplier, $warehouse, $store) {
            $sequence = PurchaseOrder::where('organization_id', $org)->lockForUpdate()->count() + 1;
            $order = PurchaseOrder::create([
                'organization_id' => $org, 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse?->id, 'store_id' => $store?->id,
                'department_id' => $data['allocationDepartmentId'] ?? null,
                'created_by' => $request->user()->id, 'po_number' => sprintf('PO-%s-%04d', now()->format('Ymd'), $sequence),
                'expected_date' => $data['expectedDate'] ?? null, 'notes' => $data['notes'] ?? null,
                'purchase_reason' => $data['purchaseReason'] ?? null, 'allocation' => $data['allocation'] ?? null,
                'collected_by' => $data['collectedBy'] ?? null, 'approved_by' => null,
            ]);
            $subtotal = 0; $taxAmount = 0;
            foreach ($data['items'] as $item) {
                $lineSubtotal = round((float) $item['orderedQty'] * (float) $item['unitCost'], 2);
                $lineTax = round($lineSubtotal * ((float) ($item['taxRate'] ?? 0) / 100), 2);
                $subtotal += $lineSubtotal; $taxAmount += $lineTax;
                $order->items()->create(['product_id' => $item['productId'], 'ordered_qty' => $item['orderedQty'], 'unit_cost' => $item['unitCost'], 'tax_rate' => $item['taxRate'] ?? 0, 'tax_amount' => $lineTax, 'total' => $lineSubtotal + $lineTax]);
            }
            $order->update(['subtotal' => $subtotal, 'tax_amount' => $taxAmount, 'total_amount' => $subtotal + $taxAmount]);
            return $order;
        });
        $notifications->notifyPurchaseOrderPendingApproval($order);
        $notifications->notifyPurchaseOrderCreatedForSupplier($order, $delivery);
        return response()->json($this->payload($order->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code', 'items.product:id,name,sku'])), 201);
    }

    public function updateStatus(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $data = $request->validate(['status' => ['required', Rule::in(['sent', 'confirmed', 'cancelled'])]]);
        $canApprove = $request->user()->hasPermission('purchase_orders.approve');
        $canIssue = $request->user()->hasPermission('purchase_orders.issue');
        $isApproval = $data['status'] === 'sent' && in_array($purchaseOrder->status, ['draft', 'sent'], true);
        $isOfficerProgression = $data['status'] === 'confirmed' && $purchaseOrder->status === 'sent';
        $isCancellation = $data['status'] === 'cancelled' && in_array($purchaseOrder->status, ['draft', 'sent'], true);
        abort_unless(($isApproval && $canApprove) || ($isOfficerProgression && ($canIssue || $canApprove)) || ($isCancellation && $canApprove), 403, 'You are not authorized to change this purchase order status.');
        $allowed = ['draft' => ['sent', 'cancelled'], 'sent' => ['sent', 'confirmed', 'cancelled']];
        abort_unless(in_array($data['status'], $allowed[$purchaseOrder->status] ?? [], true), 422, 'This status change is not allowed.');
        $purchaseOrder->update([
            'status' => $data['status'],
            'approved_by' => $data['status'] === 'sent' && $canApprove ? $request->user()->name : $purchaseOrder->approved_by,
        ]);
        return response()->json($this->payload($purchaseOrder->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code'])));
    }

    public function receive(Request $request, PurchaseOrder $purchaseOrder, NotificationService $notifications): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        abort_unless(in_array($purchaseOrder->status, ['confirmed', 'partial'], true), 422, 'Only confirmed orders can be received.');
        $data = $request->validate(['items' => ['required', 'array', 'min:1'], 'items.*.itemId' => ['required', 'integer'], 'items.*.receivedQty' => ['required', 'numeric', 'gt:0']]);
        DB::transaction(function () use ($data, $purchaseOrder, $request) {
            $items = $purchaseOrder->items()->whereIn('id', collect($data['items'])->pluck('itemId'))->lockForUpdate()->get()->keyBy('id');
            abort_unless($items->count() === count($data['items']), 422, 'One or more order items are invalid.');
            foreach ($data['items'] as $receipt) {
                $item = $items[$receipt['itemId']]; $quantity = (float) $receipt['receivedQty'];
                abort_if($item->received_qty + $quantity > $item->ordered_qty, 422, 'Received quantity cannot exceed ordered quantity.');
                $item->increment('received_qty', $quantity);
                if ($purchaseOrder->warehouse_id) {
                    $balance = StockBalance::firstOrCreate(['organization_id' => $purchaseOrder->organization_id, 'product_id' => $item->product_id, 'warehouse_id' => $purchaseOrder->warehouse_id], ['quantity' => 0]);
                    $balance = StockBalance::whereKey($balance->id)->lockForUpdate()->firstOrFail();
                    $nextBalance = $balance->quantity + $quantity; $balance->update(['quantity' => $nextBalance]);
                    StockMovement::create(['organization_id' => $purchaseOrder->organization_id, 'product_id' => $item->product_id, 'warehouse_id' => $purchaseOrder->warehouse_id, 'user_id' => $request->user()->id, 'type' => 'purchase_receipt', 'quantity' => $quantity, 'balance_after' => $nextBalance, 'reference' => $purchaseOrder->po_number]);
                }
            }
            $purchaseOrder->refresh();
            $purchaseOrder->update(['status' => $purchaseOrder->items()->whereColumn('received_qty', '<', 'ordered_qty')->exists() ? 'partial' : 'received']);
        });
        if ($purchaseOrder->warehouse_id) {
            $warehouse = $purchaseOrder->warehouse ?: Warehouse::find($purchaseOrder->warehouse_id);
            foreach (PurchaseOrderItem::with('product')->whereIn('id', collect($data['items'])->pluck('itemId'))->get() as $item) {
                if ($warehouse && $item->product) {
                    $quantity = (float) StockBalance::where('organization_id', $purchaseOrder->organization_id)->where('product_id', $item->product_id)->where('warehouse_id', $warehouse->id)->value('quantity');
                    $notifications->notifyStockLevel($item->product, $warehouse, $quantity);
                }
            }
        }
        return response()->json($this->payload($purchaseOrder->fresh()->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code', 'items.product:id,name,sku'])));
    }

    public function recordPayment(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->owned($request, $purchaseOrder);
        $this->assertCanVerifyPayments($request);
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'file' => ['required', 'file', 'max:25600', 'mimes:jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt'],
        ]);
        $file = $request->file('file');
        $path = null;
        try {
            $result = DB::transaction(function () use ($data, $file, $purchaseOrder, $request, &$path) {
            $order = PurchaseOrder::whereKey($purchaseOrder->id)->lockForUpdate()->firstOrFail();
            abort_if($order->status === 'cancelled', 422, 'Payments cannot be recorded for cancelled orders.');
            abort_unless($order->status !== 'draft' && filled($order->approved_by), 422, 'Payment cannot be verified until a procurement manager approves this purchase order.');
            abort_if($order->paid_amount + $data['amount'] > $order->total_amount, 422, 'Payment exceeds the outstanding balance.');
            $path = $file->storeAs('purchase-orders/'.$order->organization_id.'/'.$order->id, Str::uuid().'.'.$file->getClientOriginalExtension(), 'local');
            $payment = PurchaseOrderPayment::create(['purchase_order_id' => $order->id, 'recorded_by' => $request->user()->id, 'amount' => $data['amount']]);
            $order->documents()->create([
                'purchase_order_payment_id' => $payment->id,
                'uploaded_by' => $request->user()->id,
                'type' => 'proof_of_payment',
                'title' => 'Proof of payment',
                'original_name' => $file->getClientOriginalName(),
                'disk' => 'local',
                'path' => $path,
                'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
                'size' => $file->getSize(),
            ]);
            $order->increment('paid_amount', $data['amount']);
            return $order->id;
            });
        } catch (\Throwable $exception) {
            if ($path) Storage::disk('local')->delete($path);
            throw $exception;
        }
        return response()->json($this->payload(PurchaseOrder::findOrFail($result)->load(['supplier:id,name,address,phone,email', 'warehouse:id,name', 'store:id,name', 'createdBy:id,name', 'department:id,name,code', 'payments.recordedBy:id,name', 'payments.proofOfPayment', 'documents.uploadedBy:id,name'])));
    }

    private function org(Request $request): int { return (int) $request->user()->organization_id; }
    private function isSupplier(Request $request): bool { return $request->user()?->primaryRole() === 'supplier'; }
    private function owned(Request $request, PurchaseOrder $order): void { abort_unless($order->organization_id === $this->org($request), 404); if ($this->isSupplier($request)) abort_unless((int) $order->supplier_id === (int) $request->user()->supplier_id, 404); }
    private function supplierPayload(PurchaseOrder $order): array
    {
        return ['_id' => (string) $order->id, 'poNumber' => $order->po_number, 'status' => $order->status, 'expectedDate' => $order->expected_date?->toDateString(), 'approvedBy' => $order->approved_by, 'subtotal' => $order->subtotal, 'taxAmount' => $order->tax_amount, 'totalAmount' => $order->total_amount, 'createdAt' => $order->created_at->toIso8601String(), 'supplier' => $order->supplier ? ['_id' => (string) $order->supplier->id, 'name' => $order->supplier->name, 'address' => $order->supplier->address, 'phone' => $order->supplier->phone, 'email' => $order->supplier->email] : null, 'receivingLocation' => $order->warehouse ? ['id' => (string) $order->warehouse->id, 'name' => $order->warehouse->name, 'type' => 'warehouse'] : ($order->store ? ['id' => (string) $order->store->id, 'name' => $order->store->name, 'type' => 'store'] : null), 'items' => $order->relationLoaded('items') ? $order->items->map(fn (PurchaseOrderItem $item) => ['_id' => (string) $item->id, 'orderedQty' => $item->ordered_qty, 'receivedQty' => $item->received_qty, 'unitCost' => $item->unit_cost, 'taxRate' => $item->tax_rate, 'total' => $item->total, 'product' => $item->product ? ['_id' => (string) $item->product->id, 'name' => $item->product->name, 'sku' => $item->product->sku] : null])->values() : [], 'documents' => $order->relationLoaded('documents') ? $order->documents->reject(fn (PurchaseOrderDocument $document) => $document->type === 'proof_of_payment')->map(fn (PurchaseOrderDocument $document) => $this->documentPayload($document))->values() : []];
    }
    private function payload(PurchaseOrder $order): array {
        return ['_id' => (string) $order->id, 'poNumber' => $order->po_number, 'status' => $order->status, 'expectedDate' => $order->expected_date?->toDateString(), 'notes' => $order->notes, 'purchaseReason' => $order->purchase_reason, 'allocation' => $order->allocation, 'department' => $order->department ? ['id' => (string) $order->department->id, 'name' => $order->department->name, 'code' => $order->department->code] : null, 'collectedBy' => $order->collected_by, 'approvedBy' => $order->approved_by, 'subtotal' => $order->subtotal, 'taxAmount' => $order->tax_amount, 'totalAmount' => $order->total_amount, 'paidAmount' => $order->paid_amount, 'createdAt' => $order->created_at->toIso8601String(), 'createdBy' => $order->createdBy ? ['_id' => (string) $order->createdBy->id, 'name' => $order->createdBy->name] : null, 'supplier' => $order->supplier ? ['_id' => (string) $order->supplier->id, 'name' => $order->supplier->name, 'address' => $order->supplier->address, 'phone' => $order->supplier->phone, 'email' => $order->supplier->email] : null, 'warehouse' => $order->warehouse ? ['_id' => (string) $order->warehouse->id, 'name' => $order->warehouse->name] : null, 'store' => $order->store ? ['id' => (string) $order->store->id, 'name' => $order->store->name] : null, 'receivingLocation' => $order->warehouse ? ['id' => (string) $order->warehouse->id, 'name' => $order->warehouse->name, 'type' => 'warehouse'] : ($order->store ? ['id' => (string) $order->store->id, 'name' => $order->store->name, 'type' => 'store'] : null), 'items' => $order->relationLoaded('items') ? $order->items->map(fn (PurchaseOrderItem $item) => ['_id' => (string) $item->id, 'orderedQty' => $item->ordered_qty, 'receivedQty' => $item->received_qty, 'unitCost' => $item->unit_cost, 'taxRate' => $item->tax_rate, 'total' => $item->total, 'product' => $item->product ? ['_id' => (string) $item->product->id, 'name' => $item->product->name, 'sku' => $item->product->sku] : null])->values() : [], 'payments' => $order->relationLoaded('payments') ? $order->payments->map(fn ($payment) => ['id' => $payment->id, 'amount' => $payment->amount, 'recordedAt' => $payment->created_at?->toIso8601String(), 'recordedBy' => $payment->recordedBy?->name, 'proofOfPayment' => $payment->proofOfPayment ? $this->documentPayload($payment->proofOfPayment) : null])->values() : [], 'documents' => $order->relationLoaded('documents') ? $order->documents->map(fn (PurchaseOrderDocument $document) => $this->documentPayload($document))->values() : [], 'comments' => $order->relationLoaded('comments') ? $order->comments->map(fn (PurchaseOrderComment $comment) => $this->commentPayload($comment))->values() : []];
    }

    private function documentPayload(PurchaseOrderDocument $document): array
    {
        return ['id' => (string) $document->id, 'type' => $document->type, 'title' => $document->title, 'name' => $document->original_name, 'mimeType' => $document->mime_type, 'size' => $document->size, 'createdAt' => $document->created_at?->toIso8601String(), 'uploadedBy' => $document->uploadedBy?->name, 'downloadPath' => '/purchase-orders/'.$document->purchase_order_id.'/documents/'.$document->id.'/download'];
    }

    private function commentPayload(PurchaseOrderComment $comment): array
    {
        return ['id' => (string) $comment->id, 'body' => $comment->body, 'createdAt' => $comment->created_at?->toIso8601String(), 'user' => $comment->user ? ['id' => (string) $comment->user->id, 'name' => $comment->user->name] : null];
    }

    private function assertCanVerifyPayments(Request $request): void
    {
        abort_unless(in_array($request->user()->primaryRole(), ['accountant', 'super_admin'], true), 403, 'Only accountants can verify purchase order payments.');
    }

    private function assertCanManageRecords(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->primaryRole() === 'super_admin' || $user->hasPermission('purchase_orders.create') || $user->hasPermission('purchase_orders.approve') || $user->hasPermission('goods_receipts.create'), 403, 'You are not authorized to manage PO records.');
    }
}
