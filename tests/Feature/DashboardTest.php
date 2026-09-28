<?php

namespace Tests\Feature;

use App\Models\{Product, PurchaseOrder, ReplenishmentRequest, StockBalance, StockMovement, Supplier, User, Warehouse};
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_operations_dashboard_returns_live_kpis_charts_and_activity(): void
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'StockFlow@2026!'])->json('token');
        $warehouse = Warehouse::where('organization_id', $user->organization_id)->firstOrFail();
        $supplier = Supplier::create(['organization_id' => $user->organization_id, 'name' => 'Dashboard Supplier', 'is_active' => true]);
        $product = Product::create([
            'organization_id' => $user->organization_id, 'sku' => 'DASH-001', 'name' => 'Dashboard Product',
            'cost_price' => 100, 'selling_price' => 140, 'reorder_level' => 5, 'is_active' => true,
        ]);
        StockBalance::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 3]);
        StockMovement::create([
            'organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'user_id' => $user->id, 'type' => 'issue', 'quantity' => 2, 'balance_after' => 3, 'reference' => 'ISS-DASH',
        ]);
        ReplenishmentRequest::create([
            'organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'requested_by' => $user->id, 'reference' => 'REQ-DASH', 'quantity' => 10, 'reason' => 'Low stock', 'status' => 'pending',
        ]);
        PurchaseOrder::create([
            'organization_id' => $user->organization_id, 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse->id,
            'created_by' => $user->id, 'po_number' => 'PO-DASH-001', 'status' => 'confirmed', 'total_amount' => 1000,
            'paid_amount' => 250, 'expected_date' => now()->addDays(3)->toDateString(),
        ]);

        $this->withToken($token)->getJson('/api/v1/dashboard/operations')
            ->assertOk()
            ->assertJsonPath('metrics.0.key', 'pending_approvals')
            ->assertJsonPath('metrics.0.value', 1)
            ->assertJsonPath('metrics.1.key', 'open_purchase_orders')
            ->assertJsonPath('metrics.1.value', 1)
            ->assertJsonPath('charts.stockStatus.1.name', 'Low stock')
            ->assertJsonPath('charts.stockStatus.1.value', 1)
            ->assertJsonPath('charts.movementTrend.6.issued', 2)
            ->assertJsonPath('activity.0.reference', 'ISS-DASH')
            ->assertJsonPath('workQueue.0.reference', 'REQ-DASH');
    }
}
