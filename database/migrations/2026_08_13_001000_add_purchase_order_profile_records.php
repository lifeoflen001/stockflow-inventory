<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->text('purchase_reason')->nullable()->after('notes');
            $table->text('allocation')->nullable()->after('purchase_reason');
        });

        Schema::create('purchase_order_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 20);
            $table->string('title');
            $table->string('original_name');
            $table->string('disk')->default('local');
            $table->string('path');
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('size');
            $table->timestamps();
            $table->index(['purchase_order_id', 'type']);
        });

        Schema::create('purchase_order_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['purchase_order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_comments');
        Schema::dropIfExists('purchase_order_documents');
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn(['purchase_reason', 'allocation']);
        });
    }
};
