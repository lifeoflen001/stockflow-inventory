<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('products')) {
            Schema::table('products', fn (Blueprint $table) => $table->index(['organization_id', 'is_active', 'name'], 'products_org_active_name_idx'));
        }

        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', fn (Blueprint $table) => $table->index(['organization_id', 'name'], 'suppliers_org_name_idx'));
        }

        if (Schema::hasTable('purchase_order_items')) {
            Schema::table('purchase_order_items', function (Blueprint $table): void {
                $table->index(['purchase_order_id', 'product_id'], 'po_items_order_product_idx');
            });
        }

        if (Schema::hasTable('purchase_order_payments')) {
            Schema::table('purchase_order_payments', fn (Blueprint $table) => $table->index(['purchase_order_id', 'created_at'], 'po_payments_order_created_idx'));
        }

        if (Schema::hasTable('stock_balances')) {
            Schema::table('stock_balances', fn (Blueprint $table) => $table->index(['organization_id', 'warehouse_id', 'product_id'], 'stock_balances_org_warehouse_product_idx'));
        }

        if (Schema::hasTable('stock_movements')) {
            Schema::table('stock_movements', fn (Blueprint $table) => $table->index(['organization_id', 'product_id', 'created_at'], 'stock_movements_org_product_created_idx'));
        }

        if (Schema::hasTable('replenishment_requests')) {
            Schema::table('replenishment_requests', fn (Blueprint $table) => $table->index(['organization_id', 'status', 'created_at'], 'replenishment_org_status_created_idx'));
        }

        if (Schema::hasTable('media_assets')) {
            Schema::table('media_assets', fn (Blueprint $table) => $table->index(['organization_id', 'folder_id', 'created_at'], 'media_assets_org_folder_created_idx'));
        }
    }

    public function down(): void
    {
        $indexes = [
            'products' => 'products_org_active_name_idx',
            'suppliers' => 'suppliers_org_name_idx',
            'purchase_order_items' => 'po_items_order_product_idx',
            'purchase_order_payments' => 'po_payments_order_created_idx',
            'stock_balances' => 'stock_balances_org_warehouse_product_idx',
            'stock_movements' => 'stock_movements_org_product_created_idx',
            'replenishment_requests' => 'replenishment_org_status_created_idx',
            'media_assets' => 'media_assets_org_folder_created_idx',
        ];

        foreach ($indexes as $table => $index) {
            if (Schema::hasTable($table)) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($index));
            }
        }
    }
};
