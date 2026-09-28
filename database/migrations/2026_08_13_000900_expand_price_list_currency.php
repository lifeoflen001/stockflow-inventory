<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('price_lists', function (Blueprint $table) {
            $table->string('currency', 4)->default('TSHS')->change();
        });

        DB::table('price_lists')->where('currency', 'TZS')->update(['currency' => 'TSHS']);
    }

    public function down(): void
    {
        DB::table('price_lists')->where('currency', 'TSHS')->update(['currency' => 'TZS']);

        Schema::table('price_lists', function (Blueprint $table) {
            $table->string('currency', 3)->default('TZS')->change();
        });
    }
};
