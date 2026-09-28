<?php

namespace Tests\Feature;

use App\Models\{Product, PurchaseOrder, PurchaseOrderItem, PurchaseOrderPayment, Supplier, User, Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_use_live_organization_catalog_data(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email'=>'admin@stockflow.local','password'=>'StockFlow@2026!'])->json('token');
        $headers = ['Authorization'=>'Bearer '.$token];
        $this->postJson('/api/v1/products', ['sku'=>'REPORT-1','name'=>'Report Product','costPrice'=>100,'sellingPrice'=>150,'reorderLevel'=>5], $headers)->assertCreated();

        $this->getJson('/api/v1/reports/templates', $headers)->assertOk()->assertJsonFragment(['key'=>'profit-loss'])->assertJsonFragment(['key'=>'stock']);
        $this->getJson('/api/v1/reports/stock', $headers)->assertOk()
            ->assertJsonPath('key','stock')->assertJsonPath('kpis.0.value',1)
            ->assertJsonPath('rows.0.sku','REPORT-1')->assertJsonPath('rows.0.cost_price',100);
        $this->getJson('/api/v1/reports/sales', $headers)->assertOk()->assertJsonPath('available',false);
    }

    public function test_purchase_reports_use_live_order_item_and_payment_data(): void
    {
        $this->seed();
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $supplier = Supplier::create(['organization_id' => $admin->organization_id, 'name' => 'Report Supplier', 'is_active' => true]);
        $product = Product::create(['organization_id' => $admin->organization_id, 'sku' => 'REPORT-PO-1', 'name' => 'Report PO Product', 'cost_price' => 100, 'selling_price' => 150, 'is_active' => true]);
        $warehouse = Warehouse::where('organization_id', $admin->organization_id)->firstOrFail();
        $order = PurchaseOrder::create([
            'organization_id' => $admin->organization_id, 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse->id,
            'created_by' => $admin->id, 'po_number' => 'PO-REPORT-0001', 'status' => 'sent', 'subtotal' => 200,
            'tax_amount' => 36, 'total_amount' => 236, 'paid_amount' => 100,
        ]);
        PurchaseOrderItem::create(['purchase_order_id' => $order->id, 'product_id' => $product->id, 'ordered_qty' => 2, 'received_qty' => 1, 'unit_cost' => 100, 'tax_rate' => 18, 'tax_amount' => 36, 'total' => 236]);
        PurchaseOrderPayment::create(['purchase_order_id' => $order->id, 'recorded_by' => $admin->id, 'amount' => 100]);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => 'Bearer '.$token];

        $this->getJson('/api/v1/reports/purchases?from=2020-01-01&to=2030-12-31', $headers)->assertOk()
            ->assertJsonPath('available', true)->assertJsonPath('kpis.0.value', 1)->assertJsonPath('rows.0.po_number', 'PO-REPORT-0001')->assertJsonPath('rows.0.outstanding', 136);
        $this->getJson('/api/v1/reports/item-purchases?from=2020-01-01&to=2030-12-31', $headers)->assertOk()
            ->assertJsonPath('kpis.0.value', 1)->assertJsonPath('rows.0.product', 'Report PO Product')->assertJsonPath('rows.0.ordered_qty', 2);
        $this->getJson('/api/v1/reports/purchase-payments?from=2020-01-01&to=2030-12-31', $headers)->assertOk()
            ->assertJsonPath('kpis.0.value', 1)->assertJsonPath('rows.0.amount', 100)->assertJsonPath('kpis.1.value', 100);
    }
}
