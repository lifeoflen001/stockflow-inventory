<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 40)->nullable()->after('email');
            $table->string('avatar_path')->nullable()->after('phone');
        });
        Schema::table('organizations', function (Blueprint $table) {
            $table->json('settings')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['phone', 'avatar_path']));
        Schema::table('organizations', fn (Blueprint $table) => $table->dropColumn('settings'));
    }
};
