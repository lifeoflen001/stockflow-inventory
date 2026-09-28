<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', [
            'logistics.view', 'suppliers.view', 'customers.view', 'media.view',
        ])->pluck('id', 'name');

        $rolePermissions = [
            'super_admin' => array_values($permissionIds->all()),
            'procurement_manager' => array_values($permissionIds->only(['logistics.view', 'suppliers.view'])->all()),
            'procurement_officer' => array_values($permissionIds->only(['logistics.view', 'suppliers.view'])->all()),
        ];

        foreach ($rolePermissions as $roleName => $ids) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) continue;
            foreach ($ids as $permissionId) {
                DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
            }
        }
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', [
            'logistics.view', 'suppliers.view', 'customers.view', 'media.view',
        ])->pluck('id');
        $roleIds = DB::table('roles')->whereIn('name', [
            'super_admin', 'procurement_manager', 'procurement_officer',
        ])->pluck('id');
        DB::table('permission_role')->whereIn('role_id', $roleIds)->whereIn('permission_id', $permissionIds)->delete();
    }
};
