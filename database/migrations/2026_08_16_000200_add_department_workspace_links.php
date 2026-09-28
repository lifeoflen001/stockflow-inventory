<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('organization_id')->constrained('departments')->nullOnDelete();
            $table->index(['organization_id', 'department_id']);
        });

        Schema::table('user_invitations', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('role_id')->constrained('departments')->nullOnDelete();
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('created_by')->constrained('departments')->nullOnDelete();
            $table->index(['organization_id', 'department_id']);
        });

        Schema::table('replenishment_requests', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('requested_by')->constrained('departments')->nullOnDelete();
            $table->index(['organization_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::table('replenishment_requests', function (Blueprint $table) { $table->dropForeign(['department_id']); $table->dropIndex(['organization_id', 'department_id']); $table->dropColumn('department_id'); });
        Schema::table('purchase_orders', function (Blueprint $table) { $table->dropForeign(['department_id']); $table->dropIndex(['organization_id', 'department_id']); $table->dropColumn('department_id'); });
        Schema::table('user_invitations', function (Blueprint $table) { $table->dropForeign(['department_id']); $table->dropColumn('department_id'); });
        Schema::table('users', function (Blueprint $table) { $table->dropForeign(['department_id']); $table->dropIndex(['organization_id', 'department_id']); $table->dropColumn('department_id'); });
    }
};
