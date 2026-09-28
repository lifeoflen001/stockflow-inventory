<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::create('calendar_events', function (Blueprint $table) { $table->id(); $table->foreignId('organization_id')->constrained()->cascadeOnDelete(); $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete(); $table->string('title'); $table->enum('type', ['meeting','holiday','leave','birthday']); $table->dateTime('starts_at'); $table->dateTime('ends_at')->nullable(); $table->boolean('all_day')->default(false); $table->text('description')->nullable(); $table->timestamps(); $table->index(['organization_id','starts_at']); }); }
    public function down(): void { Schema::dropIfExists('calendar_events'); }
};
