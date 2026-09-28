<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->index(['organization_id', 'status', 'created_at'], 'purchase_orders_org_status_created_idx');
            $table->index(['organization_id', 'status', 'expected_date'], 'purchase_orders_org_status_expected_idx');
            $table->index(['organization_id', 'supplier_id', 'status'], 'purchase_orders_org_supplier_status_idx');
        });

        Schema::table('stock_balances', function (Blueprint $table): void {
            $table->index(['organization_id', 'product_id'], 'stock_balances_org_product_idx');
        });

        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->index(['organization_id', 'created_at', 'type'], 'stock_movements_org_created_type_idx');
        });

        Schema::table('purchase_order_payments', function (Blueprint $table): void {
            $table->index(['created_at', 'purchase_order_id'], 'po_payments_created_order_idx');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_payments', fn (Blueprint $table) => $table->dropIndex('po_payments_created_order_idx'));
        Schema::table('stock_movements', fn (Blueprint $table) => $table->dropIndex('stock_movements_org_created_type_idx'));
        Schema::table('stock_balances', fn (Blueprint $table) => $table->dropIndex('stock_balances_org_product_idx'));
        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->dropIndex('purchase_orders_org_status_created_idx');
            $table->dropIndex('purchase_orders_org_status_expected_idx');
            $table->dropIndex('purchase_orders_org_supplier_status_idx');
        });
    }
};
