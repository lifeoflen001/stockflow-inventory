<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $now = now();
        foreach ([
            ['name' => 'department.view', 'group' => 'department'],
            ['name' => 'department.orders.view', 'group' => 'department'],
            ['name' => 'department.orders.create', 'group' => 'department'],
        ] as $permission) DB::table('permissions')->updateOrInsert(['name' => $permission['name']], $permission + ['created_at' => $now, 'updated_at' => $now]);

        DB::table('roles')->updateOrInsert(['name' => 'department_manager'], ['label' => 'Department Manager', 'created_at' => $now, 'updated_at' => $now]);
        $roleId = DB::table('roles')->where('name', 'department_manager')->value('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['department.view', 'department.orders.view', 'department.orders.create'])->pluck('id');
        foreach ($permissionIds as $permissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', ['department.view', 'department.orders.view', 'department.orders.create'])->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        DB::table('roles')->where('name', 'department_manager')->delete();
    }
};
