<?php

namespace Tests\Feature;

use App\Models\{Organization, Role, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PurchaseOrderWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_procurement_manager_can_approve_draft_purchase_orders_and_comments_create_messages(): void
    {
        $this->seed();
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token');
        $adminHeaders = ['Authorization' => "Bearer {$adminToken}"];
        $manager = $this->makeRoleUser('procurement_manager', 'po-manager@stockflow.local');

        $product = $this->postJson('/api/v1/products', ['sku' => 'PO-WORKFLOW-1', 'name' => 'Workflow Product', 'costPrice' => 100, 'sellingPrice' => 120], $adminHeaders)->json('_id');
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Workflow Supplier'], $adminHeaders)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $adminHeaders)->json('0._id');
        $po = $this->postJson('/api/v1/purchase-orders', [
            'supplierId' => (int) $supplier,
            'warehouseId' => (int) $warehouse,
            'items' => [['productId' => (int) $product, 'orderedQty' => 2, 'unitCost' => 100, 'taxRate' => 0]],
        ], $adminHeaders)->assertCreated()->json();

        $managerToken = $this->postJson('/api/v1/auth/login', ['email' => $manager->email, 'password' => 'Secret@2026!'])->json('token');
        $managerHeaders = ['Authorization' => "Bearer {$managerToken}"];
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $manager->id,
            'kind' => 'alert',
            'title' => 'Purchase order approval required',
            'action_url' => '/procurement/'.$po['_id'],
        ]);

        $officer = $this->makeRoleUser('procurement_officer', 'po-officer@stockflow.local');
        $officerToken = $this->postJson('/api/v1/auth/login', ['email' => $officer->email, 'password' => 'Secret@2026!'])->json('token');
        $officerHeaders = ['Authorization' => "Bearer {$officerToken}"];
        $this->patchJson('/api/v1/purchase-orders/'.$po['_id'].'/status', ['status' => 'sent'], $officerHeaders)->assertForbidden();

        $this->patchJson('/api/v1/purchase-orders/'.$po['_id'].'/status', ['status' => 'sent'], $managerHeaders)
            ->assertOk()
            ->assertJsonPath('status', 'sent')
            ->assertJsonPath('approvedBy', $manager->name);

        $this->patchJson('/api/v1/purchase-orders/'.$po['_id'].'/status', ['status' => 'confirmed'], $officerHeaders)
            ->assertOk()
            ->assertJsonPath('status', 'confirmed');

        $this->postJson('/api/v1/purchase-orders/'.$po['_id'].'/comments', ['body' => 'Please confirm the supplier delivery date.'], $managerHeaders)->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'kind' => 'message',
            'title' => 'New purchase order comment',
            'action_url' => '/procurement/'.$po['_id'],
        ]);
        $this->withToken($adminToken)->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'message')
            ->assertJsonPath('data.0.actionUrl', '/procurement/'.$po['_id'])
            ->assertJsonPath('meta.unread_count', 1);
        $this->assertDatabaseMissing('app_notifications', ['user_id' => $manager->id, 'title' => 'New purchase order comment']);
    }

    public function test_only_accountant_can_verify_an_approved_order_with_proof_of_payment(): void
    {
        Storage::fake('local');
        $this->seed();
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $adminHeaders = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token')];
        $manager = $this->makeRoleUser('procurement_manager', 'payment-manager@stockflow.local');
        $accountant = $this->makeRoleUser('accountant', 'accountant@stockflow.local');
        $product = $this->postJson('/api/v1/products', ['sku' => 'PAYMENT-1', 'name' => 'Payment Product', 'costPrice' => 100, 'sellingPrice' => 120], $adminHeaders)->json('_id');
        $supplier = $this->postJson('/api/v1/suppliers', ['name' => 'Payment Supplier'], $adminHeaders)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $adminHeaders)->json('0._id');
        $po = $this->postJson('/api/v1/purchase-orders', ['supplierId' => (int) $supplier, 'warehouseId' => (int) $warehouse, 'items' => [['productId' => (int) $product, 'orderedQty' => 2, 'unitCost' => 100, 'taxRate' => 0]]], $adminHeaders)->json();
        $managerHeaders = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/auth/login', ['email' => $manager->email, 'password' => 'Secret@2026!'])->json('token')];
        $accountantHeaders = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/auth/login', ['email' => $accountant->email, 'password' => 'Secret@2026!'])->json('token')];

        $this->withHeaders($accountantHeaders)->post('/api/v1/purchase-orders/'.$po['_id'].'/payments', ['amount' => 200, 'file' => UploadedFile::fake()->create('draft-pop.pdf', 10, 'application/pdf')])->assertUnprocessable();
        $this->withHeaders($managerHeaders)->post('/api/v1/purchase-orders/'.$po['_id'].'/payments', ['amount' => 200, 'file' => UploadedFile::fake()->create('manager-pop.pdf', 10, 'application/pdf')])->assertForbidden();
        $this->patchJson('/api/v1/purchase-orders/'.$po['_id'].'/status', ['status' => 'sent'], $managerHeaders)->assertOk();
        $this->getJson('/api/v1/dashboard/operations', $accountantHeaders)->assertOk()->assertJsonPath('metrics.1.key', 'pending_payment_verification');

        $this->withHeaders($accountantHeaders)->post('/api/v1/purchase-orders/'.$po['_id'].'/payments', ['amount' => 200, 'file' => UploadedFile::fake()->create('proof-of-payment.pdf', 10, 'application/pdf')])->assertOk()->assertJsonPath('paidAmount', 200);
        $this->assertDatabaseHas('purchase_order_payments', ['purchase_order_id' => $po['_id'], 'recorded_by' => $accountant->id, 'amount' => 200]);
        $this->assertDatabaseHas('purchase_order_documents', ['purchase_order_id' => $po['_id'], 'type' => 'proof_of_payment', 'original_name' => 'proof-of-payment.pdf']);
    }

    public function test_supplier_only_sees_its_company_orders_and_receives_creation_alert(): void
    {
        Mail::fake(); $this->seed(); $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $adminHeaders = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token')];
        $supplierId = (int) $this->postJson('/api/v1/suppliers', ['name' => 'Scoped Supplier'], $adminHeaders)->json('_id');
        $otherSupplierId = (int) $this->postJson('/api/v1/suppliers', ['name' => 'Other Supplier'], $adminHeaders)->json('_id');
        $supplierUser = User::create(['organization_id' => $admin->organization_id, 'supplier_id' => $supplierId, 'name' => 'Supplier Contact', 'email' => 'supplier-portal@stockflow.local', 'password' => 'Secret@2026!', 'is_active' => true]); $supplierUser->forceFill(['email_verified_at' => now()])->save();
        $supplierUser->roles()->attach(Role::where('name', 'supplier')->value('id'), ['organization_id' => $admin->organization_id]);
        $product = $this->postJson('/api/v1/products', ['sku' => 'SUPPLIER-SCOPE-1', 'name' => 'Scoped Product', 'costPrice' => 100, 'sellingPrice' => 120], $adminHeaders)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $adminHeaders)->json('0._id');
        $owned = $this->postJson('/api/v1/purchase-orders', ['supplierId' => $supplierId, 'warehouseId' => $warehouse, 'items' => [['productId' => $product, 'orderedQty' => 1, 'unitCost' => 100]]], $adminHeaders)->assertCreated()->json();
        $other = $this->postJson('/api/v1/purchase-orders', ['supplierId' => $otherSupplierId, 'warehouseId' => $warehouse, 'items' => [['productId' => $product, 'orderedQty' => 1, 'unitCost' => 100]]], $adminHeaders)->assertCreated()->json();
        $supplierHeaders = ['Authorization' => 'Bearer '.$this->postJson('/api/v1/auth/login', ['email' => $supplierUser->email, 'password' => 'Secret@2026!'])->json('token')];
        $this->getJson('/api/v1/purchase-orders', $supplierHeaders)->assertOk()->assertJsonCount(1)->assertJsonPath('0._id', (string) $owned['_id']);
        $this->getJson('/api/v1/purchase-orders/'.$other['_id'], $supplierHeaders)->assertNotFound();
        $this->getJson('/api/v1/dashboard/operations', $supplierHeaders)->assertOk()->assertJsonPath('metrics.0.key', 'supplier_total_orders');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $supplierUser->id, 'title' => 'New purchase order for your company']);
        Mail::assertSent(\App\Mail\PurchaseOrderCreatedMail::class);
    }

    private function makeRoleUser(string $roleName, string $email): User
    {
        $organization = Organization::firstOrFail();
        $user = User::create(['organization_id' => $organization->id, 'name' => 'Procurement Manager', 'email' => $email, 'password' => 'Secret@2026!', 'is_active' => true]);
        $user->forceFill(['email_verified_at' => now()])->save();
        $role = Role::where('name', $roleName)->firstOrFail();
        $user->roles()->attach($role->id, ['organization_id' => $organization->id]);
        return $user;
    }
}
