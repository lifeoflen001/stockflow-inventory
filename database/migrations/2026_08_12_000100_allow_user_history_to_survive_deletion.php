<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('media_assets', function (Blueprint $table) {
            $table->dropForeign(['uploaded_by']);
            $table->unsignedBigInteger('uploaded_by')->nullable()->change();
            $table->foreign('uploaded_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('user_invitations', function (Blueprint $table) {
            $table->dropForeign(['invited_by']);
            $table->unsignedBigInteger('invited_by')->nullable()->change();
            $table->foreign('invited_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('media_assets', function (Blueprint $table) {
            $table->dropForeign(['uploaded_by']);
        });

        Schema::table('user_invitations', function (Blueprint $table) {
            $table->dropForeign(['invited_by']);
        });
    }
};
