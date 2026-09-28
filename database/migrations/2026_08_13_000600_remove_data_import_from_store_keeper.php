<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $roleId = DB::table('roles')->where('name', 'store_keeper')->value('id');
        $permissionId = DB::table('permissions')->where('name', 'data.import')->value('id');
        if ($roleId && $permissionId) DB::table('permission_role')->where('role_id', $roleId)->where('permission_id', $permissionId)->delete();
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('name', 'store_keeper')->value('id');
        $permissionId = DB::table('permissions')->where('name', 'data.import')->value('id');
        if ($roleId && $permissionId) DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
    }
};
