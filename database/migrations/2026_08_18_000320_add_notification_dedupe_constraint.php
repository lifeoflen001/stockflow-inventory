<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->unique(['organization_id', 'user_id', 'dedupe_key'], 'app_notifications_dedupe_unique');
        });
    }

    public function down(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->dropUnique('app_notifications_dedupe_unique');
        });
    }
};
