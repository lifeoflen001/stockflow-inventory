<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $now = now();
        foreach ([['name' => 'warehouse_locator.view', 'group' => 'warehouse_locator'], ['name' => 'warehouse_locator.manage', 'group' => 'warehouse_locator']] as $permission) {
            DB::table('permissions')->updateOrInsert(['name' => $permission['name']], [...$permission, 'created_at' => $now, 'updated_at' => $now]);
        }

        $permissionIds = DB::table('permissions')->whereIn('name', ['warehouse_locator.view', 'warehouse_locator.manage'])->pluck('id');
        $roleIds = DB::table('roles')->whereIn('name', ['super_admin', 'store_keeper'])->pluck('id');
        foreach ($roleIds as $roleId) foreach ($permissionIds as $permissionId) DB::table('permission_role')->insertOrIgnore(['permission_id' => $permissionId, 'role_id' => $roleId]);
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', ['warehouse_locator.view', 'warehouse_locator.manage'])->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
    }
};
