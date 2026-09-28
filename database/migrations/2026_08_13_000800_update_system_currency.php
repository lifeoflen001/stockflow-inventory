<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('currency', 4)->default('TSHS')->change();
        });
        DB::table('organizations')->where('currency', 'TZS')->update(['currency' => 'TSHS']);
    }

    public function down(): void
    {
        DB::table('organizations')->where('currency', 'TSHS')->update(['currency' => 'TZS']);

        Schema::table('organizations', function (Blueprint $table) {
            $table->string('currency', 3)->default('TZS')->change();
        });
    }
};
