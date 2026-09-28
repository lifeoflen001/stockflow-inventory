<?php

namespace Tests\Feature;

use Database\Seeders\DatabaseSeeder;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/locations')->assertUnauthorized();
    }

    public function test_superuser_can_view_organization_locations(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $this->withToken($token)->getJson('/api/v1/locations')
            ->assertOk()
            ->assertJsonPath('data.branches.0.code', 'HQ')
            ->assertJsonPath('data.stores.0.code', 'MAIN-STORE')
            ->assertJsonPath('data.warehouses.0.code', 'MAIN-WH');
    }

    public function test_custom_role_can_view_sales_but_not_logistics(): void
    {
        $this->seed(DatabaseSeeder::class);
        $organization = Organization::where('code', 'STOCKFLOW')->firstOrFail();
        $role = Role::create(['name' => 'sales_viewer', 'label' => 'Sales Viewer']);
        $role->permissions()->sync(Permission::whereIn('name', ['locations.view', 'sales.view'])->pluck('id'));
        $user = User::factory()->create([
            'organization_id' => $organization->id,
            'email' => 'sales.viewer@stockflow.local',
            'password' => 'SalesViewer@2026!',
            'is_active' => true,
        ]);
        $user->roles()->attach($role->id, ['organization_id' => $organization->id]);

        $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'SalesViewer@2026!'])->json('token');

        $this->withToken($token)->getJson('/api/v1/sales')->assertOk();
        $this->withToken($token)->getJson('/api/v1/shipments')->assertForbidden();
        $this->withToken($token)->getJson('/api/v1/search?q=warehouse')
            ->assertOk()
            ->assertJsonPath('data.results.0.type', 'Warehouse');
    }
}
