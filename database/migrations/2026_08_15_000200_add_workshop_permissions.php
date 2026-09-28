<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        foreach ([
            'vehicles.view' => 'vehicles', 'vehicles.manage' => 'vehicles',
            'staff.view' => 'staff', 'staff.manage' => 'staff',
            'workshop.issues.view' => 'workshop', 'workshop.issues.create' => 'workshop',
        ] as $name => $group) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $name],
                ['group' => $group, 'updated_at' => now(), 'created_at' => now()],
            );
        }

        $permissionIds = DB::table('permissions')->whereIn('name', ['vehicles.view', 'staff.view', 'workshop.issues.view', 'workshop.issues.create'])->pluck('id');
        foreach (['super_admin', 'store_keeper'] as $roleName) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');
            if (! $roleId) continue;
            foreach ($permissionIds as $permissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
        foreach (['vehicles.manage', 'staff.manage'] as $name) {
            $permissionId = DB::table('permissions')->where('name', $name)->value('id');
            $roleId = DB::table('roles')->where('name', 'super_admin')->value('id');
            if ($permissionId && $roleId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
    }

    public function down(): void
    {
        $names = ['vehicles.view', 'vehicles.manage', 'staff.view', 'staff.manage', 'workshop.issues.view', 'workshop.issues.create'];
        $ids = DB::table('permissions')->whereIn('name', $names)->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
