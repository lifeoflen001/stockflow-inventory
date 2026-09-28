<?php

namespace Tests\Feature;

use App\Models\{Organization, Product, Role, StockBalance, User, Warehouse};
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WarehouseLocatorTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_keeper_can_view_and_update_a_spare_part_location_without_changing_stock(): void
    {
        $this->seed(DatabaseSeeder::class);
        $organization = Organization::where('code', 'STOCKFLOW')->firstOrFail();
        $warehouse = Warehouse::where('organization_id', $organization->id)->firstOrFail();
        $product = Product::create(['organization_id' => $organization->id, 'sku' => 'LOC-001', 'name' => 'Workshop Belt', 'is_active' => true]);
        StockBalance::create(['organization_id' => $organization->id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 7]);
        $keeper = User::create(['organization_id' => $organization->id, 'name' => 'Store Keeper', 'email' => 'locator@stockflow.local', 'password' => 'Secret@2026!', 'is_active' => true]);
        $keeper->forceFill(['email_verified_at' => now()])->save();
        $keeper->roles()->attach(Role::where('name', 'store_keeper')->value('id'), ['organization_id' => $organization->id]);
        $token = $this->postJson('/api/v1/auth/login', ['email' => $keeper->email, 'password' => 'Secret@2026!'])->json('token');

        $this->withToken($token)->getJson('/api/v1/warehouse-locator?warehouseId='.$warehouse->id)
            ->assertOk()->assertJsonPath('rows.0.product.sku', 'LOC-001')->assertJsonPath('rows.0.quantity', 7)->assertJsonPath('rows.0.location', null);
        $this->withToken($token)->patchJson('/api/v1/warehouse-locator/'.$product->id, ['warehouseId' => $warehouse->id, 'section' => 'Section A', 'shelf' => 'Shelf A-03', 'notes' => 'Workshop belts'])
            ->assertOk()->assertJsonPath('section', 'Section A')->assertJsonPath('shelf', 'Shelf A-03');
        $this->withToken($token)->getJson('/api/v1/warehouse-locator?warehouseId='.$warehouse->id)
            ->assertJsonPath('rows.0.location.section', 'Section A')->assertJsonPath('rows.0.location.shelf', 'Shelf A-03')->assertJsonPath('rows.0.quantity', 7);
        $this->assertDatabaseHas('stock_balances', ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 7]);
    }
}
