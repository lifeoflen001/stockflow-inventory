<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('warehouse_id')->constrained('stores')->restrictOnDelete();
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable(false)->change();
        });
    }
};
