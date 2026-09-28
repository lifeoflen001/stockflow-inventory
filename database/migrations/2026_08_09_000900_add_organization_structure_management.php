<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) { $table->string('email')->nullable(); $table->string('phone')->nullable(); $table->text('address')->nullable(); });
        Schema::table('branches', function (Blueprint $table) { $table->string('email')->nullable(); $table->string('phone')->nullable(); });
        Schema::table('stores', function (Blueprint $table) { $table->string('email')->nullable(); $table->string('phone')->nullable(); $table->text('address')->nullable(); });
        Schema::table('warehouses', function (Blueprint $table) { $table->string('email')->nullable(); $table->string('phone')->nullable(); $table->text('address')->nullable(); });
        Schema::create('departments', function (Blueprint $table) {
            $table->id(); $table->foreignId('organization_id')->constrained()->cascadeOnDelete(); $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->string('name'); $table->string('code'); $table->string('email')->nullable(); $table->string('phone')->nullable(); $table->boolean('is_active')->default(true); $table->timestamps();
            $table->unique(['organization_id', 'code']);
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('departments');
        Schema::table('warehouses', fn (Blueprint $table) => $table->dropColumn(['email', 'phone', 'address']));
        Schema::table('stores', fn (Blueprint $table) => $table->dropColumn(['email', 'phone', 'address']));
        Schema::table('branches', fn (Blueprint $table) => $table->dropColumn(['email', 'phone']));
        Schema::table('organizations', fn (Blueprint $table) => $table->dropColumn(['email', 'phone', 'address']));
    }
};
