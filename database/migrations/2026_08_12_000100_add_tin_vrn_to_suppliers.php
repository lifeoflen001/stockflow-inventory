<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table): void {
            $table->string('tin', 100)->nullable()->after('tax_id');
            $table->string('vrn', 100)->nullable()->after('tin');
        });

        DB::table('suppliers')->whereNotNull('tax_id')->update(['tin' => DB::raw('tax_id')]);
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table): void {
            $table->dropColumn(['tin', 'vrn']);
        });
    }
};
