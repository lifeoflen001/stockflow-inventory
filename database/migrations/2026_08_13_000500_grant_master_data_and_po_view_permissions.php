<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $permissions = DB::table('permissions')->whereIn('name', ['master_data.manage', 'purchase_orders.view'])->pluck('id', 'name');
        foreach (['procurement_manager', 'procurement_officer'] as $roleName) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if ($roleId && isset($permissions['master_data.manage'])) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissions['master_data.manage']]);
        }
        $storeKeeperId = DB::table('roles')->where('name', 'store_keeper')->value('id');
        if ($storeKeeperId && isset($permissions['purchase_orders.view'])) DB::table('permission_role')->insertOrIgnore(['role_id' => $storeKeeperId, 'permission_id' => $permissions['purchase_orders.view']]);
    }

    public function down(): void
    {
        $master = DB::table('permissions')->where('name', 'master_data.manage')->value('id');
        $poView = DB::table('permissions')->where('name', 'purchase_orders.view')->value('id');
        $roleIds = DB::table('roles')->whereIn('name', ['procurement_manager', 'procurement_officer'])->pluck('id');
        if ($master && $roleIds->isNotEmpty()) DB::table('permission_role')->where('permission_id', $master)->whereIn('role_id', $roleIds)->delete();
        $storeKeeperId = DB::table('roles')->where('name', 'store_keeper')->value('id');
        if ($poView && $storeKeeperId) DB::table('permission_role')->where('permission_id', $poView)->where('role_id', $storeKeeperId)->delete();
    }
};
