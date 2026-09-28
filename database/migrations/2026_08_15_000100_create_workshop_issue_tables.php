<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('registration_number');
            $table->string('make')->nullable();
            $table->string('model')->nullable();
            $table->string('vehicle_type')->nullable();
            $table->string('department')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'registration_number']);
            $table->index(['organization_id', 'is_active']);
        });

        Schema::create('workshop_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('staff_number')->nullable();
            $table->string('name');
            $table->string('department')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'staff_number']);
            $table->index(['organization_id', 'is_active']);
        });

        Schema::create('workshop_issue_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('collector_staff_id')->nullable()->constrained('workshop_staff')->nullOnDelete();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference')->unique();
            $table->string('purpose')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('issued_at');
            $table->timestamps();
            $table->index(['organization_id', 'issued_at']);
        });

        Schema::create('workshop_issue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workshop_issue_batch_id')->constrained('workshop_issue_batches')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_before', 18, 3);
            $table->decimal('quantity_out', 18, 3);
            $table->decimal('quantity_after', 18, 3);
            $table->string('unit')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workshop_issue_items');
        Schema::dropIfExists('workshop_issue_batches');
        Schema::dropIfExists('workshop_staff');
        Schema::dropIfExists('vehicles');
    }
};
