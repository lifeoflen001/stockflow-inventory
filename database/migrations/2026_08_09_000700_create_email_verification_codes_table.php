<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::create('email_verification_codes', function (Blueprint $table) { $table->id(); $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete(); $table->string('code_hash', 64); $table->unsignedTinyInteger('attempts')->default(0); $table->dateTime('expires_at'); $table->dateTime('last_sent_at'); $table->timestamps(); }); \Illuminate\Support\Facades\DB::table('users')->whereNull('email_verified_at')->update(['email_verified_at' => now()]); }
    public function down(): void { Schema::dropIfExists('email_verification_codes'); }
};
