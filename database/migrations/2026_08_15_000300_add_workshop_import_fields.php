<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->unsignedInteger('capacity')->nullable()->after('vehicle_type');
            $table->string('status')->default('available')->after('capacity');
            $table->date('last_service')->nullable()->after('status');
            $table->date('next_service')->nullable()->after('last_service');
        });

        Schema::table('workshop_staff', function (Blueprint $table) {
            $table->string('position')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('workshop_staff', fn (Blueprint $table) => $table->dropColumn('position'));
        Schema::table('vehicles', fn (Blueprint $table) => $table->dropColumn(['capacity', 'status', 'last_service', 'next_service']));
    }
};
