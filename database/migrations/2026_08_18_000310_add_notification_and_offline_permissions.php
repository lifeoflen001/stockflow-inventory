<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $permissions = [
            ['name' => 'notifications.manage', 'group' => 'notifications'],
            ['name' => 'offline.sync', 'group' => 'offline'],
        ];
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission['name']], ['group' => $permission['group']]);
        }

        $superAdmin = Role::where('name', 'super_admin')->first();
        if ($superAdmin) {
            $superAdmin->permissions()->syncWithoutDetaching(Permission::whereIn('name', array_column($permissions, 'name'))->pluck('id'));
        }
        $offlinePermission = Permission::where('name', 'offline.sync')->value('id');
        if ($offlinePermission) {
            Role::whereIn('name', ['procurement_manager', 'procurement_officer', 'store_keeper'])->get()->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$offlinePermission]));
        }
    }

    public function down(): void
    {
        $permissionIds = Permission::whereIn('name', ['notifications.manage', 'offline.sync'])->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $permissionIds)->delete();
        Permission::whereIn('id', $permissionIds)->delete();
    }
};
