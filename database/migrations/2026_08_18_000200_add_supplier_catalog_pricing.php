<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('supplier_product_mappings', function (Blueprint $table) {
            $table->decimal('unit_price', 15, 2)->nullable()->after('supplier_description');
            $table->string('currency', 3)->default('TZS')->after('unit_price');
        });

        DB::table('permissions')->updateOrInsert(
            ['name' => 'supplier_catalog.manage'],
            ['group' => 'supplier_portal', 'created_at' => now(), 'updated_at' => now()],
        );

        $roleId = DB::table('roles')->where('name', 'supplier')->value('id');
        $permissionId = DB::table('permissions')->where('name', 'supplier_catalog.manage')->value('id');
        if ($roleId && $permissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'supplier_catalog.manage')->value('id');
        if ($permissionId) DB::table('permission_role')->where('permission_id', $permissionId)->delete();
        DB::table('permissions')->where('name', 'supplier_catalog.manage')->delete();

        Schema::table('supplier_product_mappings', function (Blueprint $table) {
            $table->dropColumn(['unit_price', 'currency']);
        });
    }
};
