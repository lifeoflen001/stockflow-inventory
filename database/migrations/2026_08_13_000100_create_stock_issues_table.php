<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('stock_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference')->unique();
            $table->string('issued_to');
            $table->string('recipient_contact')->nullable();
            $table->string('department')->nullable();
            $table->decimal('quantity', 18, 3);
            $table->string('purpose')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('issued_at');
            $table->timestamps();
            $table->index(['organization_id', 'issued_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('stock_issues'); }
};
