<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('purchase_order_documents', function ($table) {
            $table->foreignId('purchase_order_payment_id')->nullable()->after('purchase_order_id')->constrained('purchase_order_payments')->nullOnDelete();
        });

        DB::table('permissions')->updateOrInsert(
            ['name' => 'purchase_orders.payment_verify'],
            ['group' => 'purchase_orders', 'updated_at' => now(), 'created_at' => now()],
        );

        DB::table('roles')->updateOrInsert(
            ['name' => 'accountant'],
            ['label' => 'Accountant', 'updated_at' => now(), 'created_at' => now()],
        );

        $roleId = DB::table('roles')->where('name', 'accountant')->value('id');
        $permissionIds = DB::table('permissions')->whereIn('name', [
            'purchase_orders.view',
            'purchase_orders.payment_verify',
            'reports.view',
        ])->pluck('id');

        foreach ($permissionIds as $permissionId) {
            DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('name', 'accountant')->value('id');
        if ($roleId) DB::table('role_user')->where('role_id', $roleId)->delete();
        DB::table('permission_role')->where('role_id', $roleId)->delete();
        DB::table('roles')->where('id', $roleId)->delete();
        DB::table('permissions')->where('name', 'purchase_orders.payment_verify')->delete();

        Schema::table('purchase_order_documents', function ($table) {
            $table->dropForeign(['purchase_order_payment_id']);
            $table->dropColumn('purchase_order_payment_id');
        });
    }
};
