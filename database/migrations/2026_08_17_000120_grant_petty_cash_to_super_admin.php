<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $roleId = DB::table('roles')->where('name', 'super_admin')->value('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['petty_cash.view', 'petty_cash.create'])->pluck('id');
        if (! $roleId) return;
        foreach ($permissionIds as $permissionId) {
            DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('name', 'super_admin')->value('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['petty_cash.view', 'petty_cash.create'])->pluck('id');
        DB::table('permission_role')->where('role_id', $roleId)->whereIn('permission_id', $permissionIds)->delete();
    }
};
