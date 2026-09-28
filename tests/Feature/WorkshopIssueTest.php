<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\Warehouse;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkshopIssueTest extends TestCase
{
    use RefreshDatabase;

    public function test_workshop_issue_records_vehicle_collector_and_decrements_warehouse_stock(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $organization = Organization::where('code', 'STOCKFLOW')->firstOrFail();
        $warehouse = Warehouse::where('organization_id', $organization->id)->firstOrFail();
        $product = Product::create(['organization_id' => $organization->id, 'sku' => 'SP-001', 'name' => 'Workshop Brake Pad', 'is_active' => true]);
        StockBalance::create(['organization_id' => $organization->id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 12]);

        $vehicle = $this->withToken($token)->postJson('/api/v1/vehicles', ['registrationNumber' => 'T 123 ABC', 'make' => 'Toyota', 'model' => 'Hilux'])->assertCreated()->json('id');
        $staff = $this->withToken($token)->postJson('/api/v1/staff', ['staffNumber' => 'WS-001', 'name' => 'Workshop Collector'])->assertCreated()->json('id');

        $response = $this->withToken($token)->postJson('/api/v1/workshop-issues', [
            'warehouseId' => $warehouse->id,
            'vehicleId' => $vehicle,
            'collectorStaffId' => $staff,
            'issuedAt' => '2026-08-15 10:30:00',
            'purpose' => 'Vehicle repair',
            'items' => [['productId' => $product->id, 'quantity' => 3, 'unit' => 'pcs', 'comment' => 'Front axle']],
        ]);

        $response->assertCreated()->assertJsonPath('items.0.quantityBefore', 12)->assertJsonPath('items.0.quantityOut', 3)->assertJsonPath('items.0.quantityAfter', 9);
        $this->assertDatabaseHas('stock_balances', ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 9]);
        $this->assertDatabaseCount('workshop_issue_batches', 1);
    }

    public function test_warehouse_stock_reports_available_quantity_and_stats(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $organization = Organization::where('code', 'STOCKFLOW')->firstOrFail();
        $warehouse = Warehouse::where('organization_id', $organization->id)->firstOrFail();
        $product = Product::create(['organization_id' => $organization->id, 'sku' => 'SP-002', 'name' => 'Workshop Oil Filter', 'cost_price' => 25, 'reorder_level' => 5, 'is_active' => true]);
        StockBalance::create(['organization_id' => $organization->id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 12]);

        $this->withToken($token)->getJson("/api/v1/warehouses/{$warehouse->id}/stock")
            ->assertOk()
            ->assertJsonPath('0.quantity', 12)
            ->assertJsonPath('0.reservedQuantity', 0)
            ->assertJsonPath('0.available', 12)
            ->assertJsonPath('0.product.reorderLevel', 5);
        $this->withToken($token)->getJson("/api/v1/warehouses/{$warehouse->id}/stats")
            ->assertOk()
            ->assertJsonPath('totalSkus', 1)
            ->assertJsonPath('totalUnits', 12)
            ->assertJsonPath('totalValue', 300)
            ->assertJsonPath('lowStockCount', 0);
    }

    public function test_workshop_staff_and_vehicle_lists_can_be_imported(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)->postJson('/api/v1/staff/import', ['rows' => [
            ['staff_number' => '337', 'name' => 'Abdallah Rashidi Shelukindo', 'position' => 'Panel Beater', 'department' => 'Workshop'],
        ]])->assertOk()->assertJsonPath('data.imported', 1);

        $this->withToken($token)->postJson('/api/v1/vehicles/import', ['rows' => [
            ['registration_number' => 'T359EGT', 'vehicle_type' => 'Toyota LandCruiser', 'capacity' => '7', 'status' => 'available'],
        ]])->assertOk()->assertJsonPath('data.imported', 1);

        $this->assertDatabaseHas('workshop_staff', ['staff_number' => '337', 'name' => 'Abdallah Rashidi Shelukindo', 'position' => 'Panel Beater']);
        $this->assertDatabaseHas('vehicles', ['registration_number' => 'T359EGT', 'vehicle_type' => 'Toyota LandCruiser', 'capacity' => 7, 'status' => 'available']);
    }
}
