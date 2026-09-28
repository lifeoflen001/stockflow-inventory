<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'locations.view')->value('id');
        if (! $permissionId) return;

        $rows = DB::table('roles')->pluck('id')->map(fn ($roleId) => ['role_id' => $roleId, 'permission_id' => $permissionId])->all();
        if ($rows) DB::table('permission_role')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'locations.view')->value('id');
        if ($permissionId) DB::table('permission_role')->where('permission_id', $permissionId)->delete();
    }
};
