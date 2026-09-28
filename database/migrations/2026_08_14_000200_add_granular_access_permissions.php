<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        foreach ([
            'logistics.view' => 'logistics',
            'logistics.manage' => 'logistics',
            'customers.view' => 'customers',
            'suppliers.view' => 'suppliers',
            'media.view' => 'media',
        ] as $name => $group) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $name],
                ['group' => $group, 'updated_at' => now(), 'created_at' => now()],
            );
        }
    }

    public function down(): void
    {
        $names = ['logistics.view', 'logistics.manage', 'customers.view', 'suppliers.view', 'media.view'];
        $ids = DB::table('permissions')->whereIn('name', $names)->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
