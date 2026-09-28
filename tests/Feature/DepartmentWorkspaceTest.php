<?php

namespace Tests\Feature;

use App\Models\{Branch, Department, Organization, Role, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_department_manager_can_create_and_view_departmental_orders(): void
    {
        $this->seed();
        $organization = Organization::firstOrFail();
        $branch = Branch::where('organization_id', $organization->id)->firstOrFail();
        $department = Department::create(['organization_id' => $organization->id, 'branch_id' => $branch->id, 'name' => 'Workshop', 'code' => 'WORKSHOP', 'is_active' => true]);
        $manager = User::create(['organization_id' => $organization->id, 'department_id' => $department->id, 'name' => 'Workshop Manager', 'email' => 'department-manager@stockflow.local', 'password' => 'Secret@2026!', 'is_active' => true]);
        $manager->forceFill(['email_verified_at' => now()])->save();
        $manager->roles()->attach(Role::where('name', 'department_manager')->value('id'), ['organization_id' => $organization->id]);
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => "Bearer {$adminToken}"];
        $product = $this->postJson('/api/v1/products', ['sku' => 'DEPT-001', 'name' => 'Department Item', 'costPrice' => 20, 'sellingPrice' => 25], $headers)->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $headers)->json('0._id');
        $managerLogin = $this->postJson('/api/v1/auth/login', ['email' => $manager->email, 'password' => 'Secret@2026!'])->assertOk();
        $managerToken = $managerLogin->json('token');

        $this->withToken($managerToken)->getJson('/api/v1/department-workspace')->assertOk()->assertJsonPath('department.code', 'WORKSHOP');
        $this->withToken($managerToken)->postJson('/api/v1/department-workspace/orders', [
            'productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'quantity' => 4, 'reason' => 'Workshop requirement',
        ])->assertCreated()->assertJsonPath('reference', fn ($value) => str_starts_with($value, 'DOR-'));

        $this->assertDatabaseHas('replenishment_requests', ['department_id' => $department->id, 'product_id' => $product, 'quantity' => 4, 'status' => 'pending']);
        $this->withToken($managerToken)->getJson('/api/v1/department-workspace')->assertJsonPath('summary.pendingOrders', 1)->assertJsonPath('orders.0.product.sku', 'DEPT-001');
        $this->withToken($managerToken)->getJson('/api/v1/dashboard/operations')
            ->assertOk()
            ->assertJsonPath('department.code', 'WORKSHOP')
            ->assertJsonPath('metrics.0.key', 'department_total_orders')
            ->assertJsonPath('metrics.0.value', 1)
            ->assertJsonPath('summary.inventoryUnits', 0)
            ->assertJsonPath('warehouseComparison', []);
    }
}
