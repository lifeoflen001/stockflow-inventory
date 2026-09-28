<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\{Branch, Organization, Product, PurchaseOrder, PurchaseOrderItem, Role, Supplier, User, Warehouse};
use Tests\TestCase;

class CompanyAndIssueTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_create_a_company(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)->postJson('/api/v1/companies', [
            'name' => 'Second Company', 'code' => 'SECOND', 'email' => 'hello@second.test', 'is_active' => true,
        ])->assertCreated()->assertJsonPath('data.code', 'SECOND');

        $this->withToken($token)->getJson('/api/v1/companies')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_super_admin_can_delete_a_company_with_all_related_data(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $organization = Organization::create(['name' => 'Delete Me Ltd', 'code' => 'DELETE-ME']);
        $branch = Branch::create(['organization_id' => $organization->id, 'name' => 'Delete Me HQ', 'code' => 'HQ', 'is_active' => true]);
        $warehouse = Warehouse::create(['organization_id' => $organization->id, 'branch_id' => $branch->id, 'name' => 'Delete Me Warehouse', 'code' => 'WH-1', 'is_active' => true]);
        $supplier = Supplier::create(['organization_id' => $organization->id, 'name' => 'Delete Me Supplier', 'rating' => 5, 'is_active' => true]);
        $product = Product::create(['organization_id' => $organization->id, 'sku' => 'DELETE-1', 'name' => 'Delete Me Product', 'cost_price' => 10, 'selling_price' => 15, 'is_active' => true]);
        $user = User::create(['organization_id' => $organization->id, 'name' => 'Delete Me User', 'email' => 'delete-me@stockflow.local', 'password' => 'Secret@2026!', 'is_active' => true, 'email_verified_at' => now()]);
        $user->roles()->attach(Role::where('name', 'procurement_officer')->value('id'), ['organization_id' => $organization->id]);
        $order = PurchaseOrder::create(['organization_id' => $organization->id, 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse->id, 'created_by' => $user->id, 'po_number' => 'PO-DELETE-1', 'status' => 'draft', 'subtotal' => 10, 'tax_amount' => 0, 'total_amount' => 10, 'paid_amount' => 0]);
        PurchaseOrderItem::create(['purchase_order_id' => $order->id, 'product_id' => $product->id, 'ordered_qty' => 1, 'received_qty' => 0, 'unit_cost' => 10, 'tax_rate' => 0, 'tax_amount' => 0, 'total' => 10]);

        $this->withToken($token)->deleteJson('/api/v1/companies/'.$organization->id)
            ->assertOk()
            ->assertJsonPath('data.deleted', true)
            ->assertJsonPath('data.purchaseOrders', 1);

        $this->assertDatabaseMissing('organizations', ['id' => $organization->id]);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('suppliers', ['id' => $supplier->id]);
        $this->assertDatabaseMissing('purchase_orders', ['id' => $order->id]);
        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }

    public function test_issue_goods_deducts_stock_and_is_recorded(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];
        $product = $this->postJson('/api/v1/products', ['sku' => 'ISSUE-1', 'name' => 'Issued Item', 'costPrice' => 10, 'sellingPrice' => 15], $headers)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $headers)->json('0._id');

        $this->postJson('/api/v1/inventory/adjustments', ['productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'type' => 'add', 'quantity' => 12], $headers)->assertCreated();
        $this->postJson('/api/v1/inventory/issues', [
            'productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'quantity' => 3,
            'issuedTo' => 'Asha Mushi', 'department' => 'Operations', 'purpose' => 'Field work',
        ], $headers)->assertCreated()->assertJsonPath('issuedTo', 'Asha Mushi')->assertJsonPath('quantity', 3);

        $this->assertDatabaseHas('stock_balances', ['product_id' => $product, 'warehouse_id' => $warehouse, 'quantity' => 9]);
        $this->getJson('/api/v1/inventory/issues', $headers)->assertOk()->assertJsonCount(1)->assertJsonPath('0.issuedTo', 'Asha Mushi');
        $this->assertDatabaseHas('stock_movements', ['product_id' => $product, 'type' => 'issue', 'quantity' => 3]);
    }

    public function test_store_keeper_cannot_create_purchase_orders_or_master_data_and_cannot_view_administration(): void
    {
        $this->seed();
        $user = $this->makeRoleUser('store_keeper', 'keeper@stockflow.local');
        $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Secret@2026!'])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->getJson('/api/v1/users', $headers)->assertForbidden();
        $this->getJson('/api/v1/roles', $headers)->assertForbidden();
        $this->postJson('/api/v1/products', ['sku' => 'DENIED-1', 'name' => 'Denied', 'costPrice' => 1, 'sellingPrice' => 2], $headers)->assertForbidden();
        $this->postJson('/api/v1/suppliers', ['name' => 'Denied Supplier'], $headers)->assertForbidden();
        $this->postJson('/api/v1/purchase-orders', [], $headers)->assertForbidden();
    }

    public function test_procurement_roles_cannot_view_users_or_roles(): void
    {
        $this->seed();
        foreach (['procurement_manager', 'procurement_officer'] as $index => $role) {
            $user = $this->makeRoleUser($role, "procurement{$index}@stockflow.local");
            $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Secret@2026!'])->json('token');
            $this->getJson('/api/v1/users', ['Authorization' => "Bearer {$token}"])->assertForbidden();
            $this->getJson('/api/v1/roles', ['Authorization' => "Bearer {$token}"])->assertForbidden();
        }
    }

    public function test_store_keeper_can_send_replenishment_request_to_procurement(): void
    {
        $this->seed();
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $adminHeaders = ['Authorization' => "Bearer {$adminToken}"];
        $product = $this->postJson('/api/v1/products', ['sku' => 'REQ-1', 'name' => 'Ending Item', 'costPrice' => 10, 'sellingPrice' => 15], $adminHeaders)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $adminHeaders)->json('0._id');
        $keeper = $this->makeRoleUser('store_keeper', 'requester@stockflow.local');
        $keeperToken = $this->postJson('/api/v1/auth/login', ['email' => $keeper->email, 'password' => 'Secret@2026!'])->json('token');
        $keeperHeaders = ['Authorization' => "Bearer {$keeperToken}"];

        $this->postJson('/api/v1/replenishment-requests', ['productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'quantity' => 20], $keeperHeaders)->assertCreated()->assertJsonPath('reason', 'Low or ending stock');
        $this->getJson('/api/v1/replenishment-requests', $adminHeaders)->assertOk()->assertJsonPath('0.quantity', 20);
    }

    private function makeRoleUser(string $roleName, string $email): User
    {
        $organization = Organization::firstOrFail();
        $user = User::create(['organization_id' => $organization->id, 'name' => $roleName, 'email' => $email, 'password' => 'Secret@2026!', 'is_active' => true]);
        $user->forceFill(['email_verified_at' => now()])->save();
        $role = Role::where('name', $roleName)->firstOrFail();
        $user->roles()->attach($role->id, ['organization_id' => $organization->id]);
        return $user;
    }
}
