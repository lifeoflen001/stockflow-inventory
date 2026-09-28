<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('petty_cash_vouchers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('voucher_number', 40);
            $table->date('issued_at');
            $table->string('collector', 255);
            $table->text('required_for');
            $table->decimal('amount', 15, 2);
            $table->string('currency', 4)->default('TSHS');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'voucher_number']);
            $table->index(['organization_id', 'issued_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('petty_cash_vouchers'); }
};
