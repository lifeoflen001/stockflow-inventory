<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('media_folders', function (Blueprint $table) { $table->id(); $table->foreignId('organization_id')->constrained()->cascadeOnDelete(); $table->string('name'); $table->timestamps(); $table->unique(['organization_id', 'name']); });
        Schema::create('media_assets', function (Blueprint $table) { $table->id(); $table->foreignId('organization_id')->constrained()->cascadeOnDelete(); $table->foreignId('folder_id')->nullable()->constrained('media_folders')->nullOnDelete(); $table->foreignId('uploaded_by')->constrained('users'); $table->string('name'); $table->string('original_name'); $table->string('disk')->default('public'); $table->string('path'); $table->string('mime_type', 150); $table->string('extension', 20)->nullable(); $table->unsignedBigInteger('size'); $table->timestamps(); $table->index(['organization_id', 'created_at']); });
    }
    public function down(): void { Schema::dropIfExists('media_assets'); Schema::dropIfExists('media_folders'); }
};
