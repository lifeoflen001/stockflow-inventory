<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('petty_cash_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('petty_cash_voucher_id')->constrained('petty_cash_vouchers')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->string('original_name');
            $table->string('disk')->default('local');
            $table->string('path');
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('size');
            $table->timestamps();
            $table->index('petty_cash_voucher_id');
        });

        Schema::create('petty_cash_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('petty_cash_voucher_id')->constrained('petty_cash_vouchers')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['petty_cash_voucher_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('petty_cash_comments');
        Schema::dropIfExists('petty_cash_documents');
    }
};
