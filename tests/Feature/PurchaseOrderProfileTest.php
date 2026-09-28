<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use App\Models\{Branch, Department, Store, User};
use Tests\TestCase;

class PurchaseOrderProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_purchase_order_profile_keeps_documents_comments_and_context(): void
    {
        Storage::fake('local');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $branch = Branch::create(['organization_id' => $admin->organization_id, 'name' => 'Arusha', 'code' => 'ARU', 'is_active' => true]);
        $department = Department::create(['organization_id' => $admin->organization_id, 'branch_id' => $branch->id, 'name' => 'Operations', 'code' => 'OPS', 'is_active' => true]);
        $store = Store::create(['organization_id' => $admin->organization_id, 'branch_id' => $branch->id, 'name' => 'Arusha Store', 'code' => 'ARU-STORE', 'is_active' => true]);
        $category = $this->postJson('/api/v1/categories', ['name' => 'General', 'color' => '#22c55e'], $headers)->json('_id');
        $unit = $this->postJson('/api/v1/units', ['name' => 'Piece', 'abbreviation' => 'pc'], $headers)->json('_id');
        $product = $this->postJson('/api/v1/products', ['sku' => 'PO-ITEM', 'name' => 'PO Item', 'costPrice' => 100, 'sellingPrice' => 120, 'categoryId' => (int) $category, 'unitId' => (int) $unit], $headers)->json('_id');
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Profile Supplier', 'address' => '1 Supplier Road'], $headers)->json('_id');
        $warehouse = $this->postJson('/api/v1/warehouses', ['name' => 'Profile Warehouse'], $headers)->json('_id');

        $po = $this->postJson('/api/v1/purchase-orders', [
            'supplierId' => (int) $supplier,
            'warehouseId' => (int) $warehouse,
            'purchaseReason' => 'Replace failed equipment',
            'allocationDepartmentId' => $department->id,
            'collectedBy' => 'Store Keeper',
            'approvedBy' => 'Procurement Manager',
            'items' => [['productId' => (int) $product, 'orderedQty' => 2, 'unitCost' => 100, 'taxRate' => 0]],
        ], $headers)->assertCreated()->json();
        $this->assertSame('Operations', $po['allocation']);

        $this->postJson('/api/v1/purchase-orders', [
            'supplierId' => (int) $supplier,
            'locationType' => 'store',
            'locationId' => $store->id,
            'items' => [['productId' => (int) $product, 'orderedQty' => 1, 'unitCost' => 100, 'taxRate' => 0]],
        ], $headers)->assertCreated()->assertJsonPath('receivingLocation.type', 'store')->assertJsonPath('receivingLocation.name', 'Arusha Store');

        $this->withHeaders($headers)->patchJson('/api/v1/purchase-orders/'.$po['_id'].'/profile', [
            'purchaseReason' => 'Updated equipment replacement plan',
            'allocationDepartmentId' => $department->id,
        ])->assertOk()->assertJsonPath('purchaseReason', 'Updated equipment replacement plan');

        $this->withHeaders($headers)->post('/api/v1/purchase-orders/'.$po['_id'].'/documents', [
            'type' => 'receipt', 'title' => 'Goods received note', 'file' => UploadedFile::fake()->create('receipt.pdf', 20, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('type', 'receipt');
        $this->withHeaders($headers)->post('/api/v1/purchase-orders/'.$po['_id'].'/documents', [
            'type' => 'invoice', 'file' => UploadedFile::fake()->create('invoice.pdf', 20, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('type', 'invoice');
        $this->postJson('/api/v1/purchase-orders/'.$po['_id'].'/comments', ['body' => 'Please verify the supplier invoice before payment.'], $headers)->assertCreated();

        $this->withHeaders($headers)->getJson('/api/v1/purchase-orders/'.$po['_id'])
            ->assertOk()
            ->assertJsonPath('purchaseReason', 'Updated equipment replacement plan')
            ->assertJsonPath('allocation', 'Operations')
            ->assertJsonPath('supplier.address', '1 Supplier Road')
            ->assertJsonCount(2, 'documents')
            ->assertJsonCount(1, 'comments');
        $this->assertDatabaseHas('purchase_order_documents', ['purchase_order_id' => $po['_id'], 'type' => 'receipt']);
        $this->assertDatabaseHas('purchase_order_comments', ['purchase_order_id' => $po['_id'], 'body' => 'Please verify the supplier invoice before payment.']);
    }
}
