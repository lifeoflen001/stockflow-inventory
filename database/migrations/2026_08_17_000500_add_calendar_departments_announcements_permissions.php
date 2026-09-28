<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    private const PERMISSIONS = [
        ['name' => 'calendar.view', 'group' => 'calendar'],
        ['name' => 'calendar.manage', 'group' => 'calendar'],
        ['name' => 'departments.view', 'group' => 'departments'],
        ['name' => 'departments.manage', 'group' => 'departments'],
        ['name' => 'announcements.view', 'group' => 'announcements'],
        ['name' => 'announcements.manage', 'group' => 'announcements'],
    ];

    public function up(): void
    {
        $now = now();
        foreach (self::PERMISSIONS as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                [...$permission, 'created_at' => $now, 'updated_at' => $now],
            );
        }

        $this->grantToRolesWith('locations.view', ['calendar.view', 'departments.view']);
        $this->grantToRolesWith('locations.manage', ['calendar.manage', 'departments.manage']);
        $usersManagePermissionId = DB::table('permissions')->where('name', 'users.manage')->value('id');
        $roleIds = DB::table('roles')->where('name', 'super_admin')->pluck('id');
        if ($usersManagePermissionId) {
            $roleIds = $roleIds->merge(DB::table('permission_role')->where('permission_id', $usersManagePermissionId)->pluck('role_id'));
        }
        $viewPermissionId = DB::table('permissions')->where('name', 'announcements.view')->value('id');
        $announcementManagePermissionId = DB::table('permissions')->where('name', 'announcements.manage')->value('id');
        foreach (DB::table('roles')->pluck('id') as $roleId) {
            if ($viewPermissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $viewPermissionId]);
        }
        foreach ($roleIds->unique() as $roleId) {
            if ($announcementManagePermissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $announcementManagePermissionId]);
        }
    }

    private function grantToRolesWith(string $existingPermission, array $newPermissions): void
    {
        $existingId = DB::table('permissions')->where('name', $existingPermission)->value('id');
        if (! $existingId) return;
        $roleIds = DB::table('permission_role')->where('permission_id', $existingId)->pluck('role_id');
        $permissionIds = DB::table('permissions')->whereIn('name', $newPermissions)->pluck('id');
        foreach ($roleIds as $roleId) {
            foreach ($permissionIds as $permissionId) {
                DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
            }
        }
    }

    public function down(): void
    {
        $permissionIds = DB::table('permissions')->whereIn('name', array_column(self::PERMISSIONS, 'name'))->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
    }
};
