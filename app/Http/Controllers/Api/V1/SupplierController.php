<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{PurchaseOrder, Supplier, SupplierContact, SupplierDocument, SupplierProductMapping, SupplierReturn};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    public function catalog(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier);
        $supplier->load('productMappings.product:id,name,sku');

        return response()->json([
            'supplier' => ['id' => (string) $supplier->id, 'name' => $supplier->name, 'currency' => $supplier->currency ?: 'TZS'],
            'mappings' => $supplier->productMappings->map(fn ($mapping) => $this->mappingPayload($mapping, $supplier))->values(),
        ]);
    }

    public function documents(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier);
        $supplier->load('documents.uploadedBy:id,name');

        return response()->json([
            'supplier' => ['id' => (string) $supplier->id, 'name' => $supplier->name],
            'documents' => $supplier->documents->map(fn (SupplierDocument $document) => $this->documentPayload($document))->values(),
        ]);
    }

    public function profile(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier);
        $supplier->load(['contacts' => fn ($query) => $query->where('is_active', true)->orderByDesc('is_primary')->orderBy('name'), 'commercialTerms', 'productMappings.product:id,name,sku', 'documents.uploadedBy:id,name']);
        $orders = PurchaseOrder::query()->where('organization_id', $supplier->organization_id)->where('supplier_id', $supplier->id)->latest()->get();
        $returns = SupplierReturn::query()->where('supplier_id', $supplier->id)->with('purchaseOrder:id,po_number')->latest()->get();
        $invoices = $supplier->purchaseOrders()->with('documents')->get()->flatMap(fn (PurchaseOrder $order) => $order->documents->where('type', 'invoice')->map(fn ($document) => ['id' => 'invoice-'.$document->id, 'type' => 'invoice', 'reference' => $document->title ?: $document->original_name, 'status' => 'attached', 'amount' => null, 'date' => $document->created_at?->toIso8601String(), 'purchaseOrder' => $order->po_number]));
        $transactions = $orders->map(fn (PurchaseOrder $order) => ['id' => 'po-'.$order->id, 'type' => 'purchase_order', 'reference' => $order->po_number, 'status' => $order->status, 'amount' => (float) $order->total_amount, 'date' => $order->created_at?->toIso8601String()])
            ->concat($returns->map(fn (SupplierReturn $return) => ['id' => 'return-'.$return->id, 'type' => 'return', 'reference' => $return->return_number, 'status' => $return->status, 'amount' => (float) $return->amount, 'date' => $return->returned_at?->toIso8601String() ?? $return->created_at?->toIso8601String(), 'purchaseOrder' => $return->purchaseOrder?->po_number]))
            ->concat($invoices)->sortByDesc('date')->values();

        return response()->json([
            'supplier' => ['_id' => (string) $supplier->id, 'name' => $supplier->name, 'email' => $supplier->email, 'phone' => $supplier->phone, 'address' => $supplier->address, 'city' => $supplier->city, 'country' => $supplier->country, 'legalAddress' => $supplier->address, 'taxId' => $supplier->tax_id, 'tin' => $supplier->tin, 'vrn' => $supplier->vrn, 'currency' => $supplier->currency ?: ($supplier->commercialTerms?->currency ?? 'TZS'), 'contactPerson' => $supplier->contact_person, 'paymentTerms' => $supplier->payment_terms, 'notes' => $supplier->notes, 'rating' => $supplier->rating],
            'contacts' => $supplier->contacts->values(), 'commercialTerms' => $supplier->commercialTerms,
            'mappings' => $supplier->productMappings->map(fn ($mapping) => $this->mappingPayload($mapping, $supplier))->values(),
            'documents' => $supplier->documents->map(fn (SupplierDocument $document) => $this->documentPayload($document))->values(), 'transactions' => $transactions,
            'stats' => ['totalOrders' => $orders->count(), 'totalSpend' => (float) $orders->sum('total_amount'), 'totalPaid' => (float) $orders->sum('paid_amount'), 'outstanding' => max(0, (float) $orders->sum('total_amount') - (float) $orders->sum('paid_amount'))],
        ]);
    }

    public function storeContact(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier); $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'role' => ['nullable', 'string', 'max:100'], 'email' => ['nullable', 'email', 'max:255'], 'phone' => ['nullable', 'string', 'max:80'], 'notes' => ['nullable', 'string', 'max:2000'], 'isPrimary' => ['sometimes', 'boolean']]);
        if (! empty($data['isPrimary'])) $supplier->contacts()->update(['is_primary' => false]);
        return response()->json($supplier->contacts()->create(['name' => $data['name'], 'role' => $data['role'] ?? null, 'email' => $data['email'] ?? null, 'phone' => $data['phone'] ?? null, 'notes' => $data['notes'] ?? null, 'is_primary' => $data['isPrimary'] ?? false, 'is_active' => true]), 201);
    }

    public function updateContact(Request $request, Supplier $supplier, SupplierContact $contact): JsonResponse
    {
        $this->owned($request, $supplier); abort_unless($contact->supplier_id === $supplier->id, 404); $data = $request->validate(['name' => ['sometimes', 'string', 'max:255'], 'role' => ['nullable', 'string', 'max:100'], 'email' => ['nullable', 'email', 'max:255'], 'phone' => ['nullable', 'string', 'max:80'], 'notes' => ['nullable', 'string', 'max:2000'], 'isPrimary' => ['sometimes', 'boolean']]);
        if (! empty($data['isPrimary'])) $supplier->contacts()->whereKeyNot($contact->id)->update(['is_primary' => false]); $contact->update(collect($data)->mapWithKeys(fn ($value, $key) => [Str::snake($key) => $value])->all()); return response()->json($contact->fresh());
    }

    public function destroyContact(Request $request, Supplier $supplier, SupplierContact $contact): JsonResponse { $this->owned($request, $supplier); abort_unless($contact->supplier_id === $supplier->id, 404); $contact->delete(); return response()->json(['deleted' => true]); }

    public function updateTerms(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier); $data = $request->validate(['currency' => ['nullable', 'string', 'size:3'], 'paymentTerms' => ['nullable', 'string', 'max:255'], 'minimumOrderQuantity' => ['nullable', 'numeric', 'min:0'], 'preferredShippingMethod' => ['nullable', 'string', 'max:255'], 'pricingTiers' => ['nullable', 'array'], 'volumeDiscounts' => ['nullable', 'array'], 'notes' => ['nullable', 'string', 'max:5000']]);
        $terms = $supplier->commercialTerms()->updateOrCreate([], ['currency' => strtoupper($data['currency'] ?? $supplier->currency ?? 'TZS'), 'payment_terms' => $data['paymentTerms'] ?? null, 'minimum_order_quantity' => $data['minimumOrderQuantity'] ?? null, 'preferred_shipping_method' => $data['preferredShippingMethod'] ?? null, 'pricing_tiers' => $data['pricingTiers'] ?? null, 'volume_discounts' => $data['volumeDiscounts'] ?? null, 'notes' => $data['notes'] ?? null]); $supplier->update(['currency' => $terms->currency, 'payment_terms' => $terms->payment_terms]); return response()->json($terms->fresh());
    }

    public function storeMapping(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier); $data = $request->validate(['supplierSku' => ['required', 'string', 'max:255'], 'supplierPartNumber' => ['nullable', 'string', 'max:255'], 'supplierDescription' => ['nullable', 'string', 'max:255'], 'productId' => ['nullable', 'integer', Rule::exists('products', 'id')->where('organization_id', $supplier->organization_id)], 'unitPrice' => ['nullable', 'numeric', 'min:0'], 'currency' => ['nullable', 'string', 'size:3'], 'unitConversion' => ['nullable', 'numeric', 'gt:0'], 'notes' => ['nullable', 'string', 'max:2000']]);
        return response()->json($supplier->productMappings()->create(['supplier_sku' => trim($data['supplierSku']), 'supplier_part_number' => $data['supplierPartNumber'] ?? null, 'supplier_description' => $data['supplierDescription'] ?? null, 'product_id' => $data['productId'] ?? null, 'unit_price' => $data['unitPrice'] ?? null, 'currency' => strtoupper($data['currency'] ?? $supplier->currency ?? 'TZS'), 'unit_conversion' => $data['unitConversion'] ?? 1, 'notes' => $data['notes'] ?? null])->load('product:id,name,sku'), 201);
    }

    public function updateMapping(Request $request, Supplier $supplier, SupplierProductMapping $mapping): JsonResponse { $this->owned($request, $supplier); abort_unless($mapping->supplier_id === $supplier->id, 404); $data = $request->validate(['supplierSku' => ['sometimes', 'string', 'max:255'], 'supplierPartNumber' => ['nullable', 'string', 'max:255'], 'supplierDescription' => ['nullable', 'string', 'max:255'], 'productId' => ['nullable', 'integer', Rule::exists('products', 'id')->where('organization_id', $supplier->organization_id)], 'unitPrice' => ['nullable', 'numeric', 'min:0'], 'currency' => ['nullable', 'string', 'size:3'], 'unitConversion' => ['nullable', 'numeric', 'gt:0'], 'notes' => ['nullable', 'string', 'max:2000']]); $mapping->update(collect($data)->mapWithKeys(fn ($value, $key) => [Str::snake($key) => $key === 'currency' ? strtoupper((string) $value) : ($key === 'supplierSku' ? trim((string) $value) : $value)])->all()); return response()->json($mapping->fresh()->load('product:id,name,sku')); }
    public function destroyMapping(Request $request, Supplier $supplier, SupplierProductMapping $mapping): JsonResponse { $this->owned($request, $supplier); abort_unless($mapping->supplier_id === $supplier->id, 404); $mapping->delete(); return response()->json(['deleted' => true]); }

    public function uploadDocument(Request $request, Supplier $supplier): JsonResponse
    {
        $this->owned($request, $supplier); $data = $request->validate(['type' => ['required', Rule::in(['contract', 'compliance', 'insurance', 'other'])], 'title' => ['nullable', 'string', 'max:255'], 'expiresAt' => ['nullable', 'date'], 'notes' => ['nullable', 'string', 'max:2000'], 'file' => ['required', 'file', 'max:25600', 'mimes:jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt']]); $file = $request->file('file'); $path = $file->storeAs('supplier-documents/'.$supplier->organization_id.'/'.$supplier->id, Str::uuid().'.'.$file->getClientOriginalExtension(), 'local');
        $document = $supplier->documents()->create(['uploaded_by' => $request->user()->id, 'type' => $data['type'], 'title' => trim($data['title'] ?? '') ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME), 'original_name' => $file->getClientOriginalName(), 'disk' => 'local', 'path' => $path, 'mime_type' => $file->getMimeType() ?: 'application/octet-stream', 'size' => $file->getSize(), 'expires_at' => $data['expiresAt'] ?? null, 'notes' => $data['notes'] ?? null]); return response()->json($this->documentPayload($document->load('uploadedBy:id,name')), 201);
    }
    public function downloadDocument(Request $request, Supplier $supplier, SupplierDocument $document) { $this->owned($request, $supplier); abort_unless($document->supplier_id === $supplier->id, 404); abort_unless(Storage::disk($document->disk)->exists($document->path), 404); return Storage::disk($document->disk)->download($document->path, $document->original_name, ['Content-Type' => $document->mime_type]); }
    public function destroyDocument(Request $request, Supplier $supplier, SupplierDocument $document): JsonResponse { $this->owned($request, $supplier); abort_unless($document->supplier_id === $supplier->id, 404); Storage::disk($document->disk)->delete($document->path); $document->delete(); return response()->json(['deleted' => true]); }
    private function owned(Request $request, Supplier $supplier): void
    {
        $user = $request->user();
        abort_unless((int) $supplier->organization_id === (int) $user->organization_id, 404);
        if ($user->supplier_id !== null) abort_unless((int) $user->supplier_id === (int) $supplier->id, 404);
    }
    private function mappingPayload(SupplierProductMapping $mapping, Supplier $supplier): array { return ['id' => (string) $mapping->id, 'supplierSku' => $mapping->supplier_sku, 'supplierPartNumber' => $mapping->supplier_part_number, 'supplierDescription' => $mapping->supplier_description, 'unitPrice' => $mapping->unit_price === null ? null : (float) $mapping->unit_price, 'currency' => $mapping->currency ?: ($supplier->currency ?: 'TZS'), 'unitConversion' => (float) $mapping->unit_conversion, 'notes' => $mapping->notes, 'product' => $mapping->product ? ['id' => (string) $mapping->product->id, 'name' => $mapping->product->name, 'sku' => $mapping->product->sku] : null]; }
    private function documentPayload(SupplierDocument $document): array { $expiry = $document->expires_at?->toDateString(); return ['id' => (string) $document->id, 'type' => $document->type, 'title' => $document->title, 'name' => $document->original_name, 'mimeType' => $document->mime_type, 'size' => $document->size, 'expiresAt' => $expiry, 'expiryStatus' => ! $expiry ? 'none' : ($document->expires_at->isPast() ? 'expired' : ($document->expires_at->lte(now()->addDays(30)) ? 'expiring' : 'valid')), 'notes' => $document->notes, 'uploadedBy' => $document->uploadedBy?->name, 'createdAt' => $document->created_at?->toIso8601String(), 'downloadPath' => '/suppliers/'.$document->supplier_id.'/documents/'.$document->id.'/download']; }
}
