<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        foreach (['petty_cash.view', 'petty_cash.create'] as $name) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $name],
                ['group' => 'petty_cash', 'updated_at' => now(), 'created_at' => now()],
            );
        }

        $permissionIds = DB::table('permissions')->whereIn('name', ['petty_cash.view', 'petty_cash.create'])->pluck('id', 'name');
        foreach (['procurement_manager' => ['petty_cash.view'], 'procurement_officer' => ['petty_cash.view', 'petty_cash.create']] as $roleName => $permissions) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) continue;
            foreach ($permissions as $permission) {
                if (isset($permissionIds[$permission])) {
                    DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionIds[$permission]]);
                }
            }
        }
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', ['petty_cash.view', 'petty_cash.create'])->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
    }
};
