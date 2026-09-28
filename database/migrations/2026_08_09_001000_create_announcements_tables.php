<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('announcements', function (Blueprint $table) { $table->id(); $table->foreignId('organization_id')->constrained()->cascadeOnDelete(); $table->foreignId('created_by')->constrained('users')->cascadeOnDelete(); $table->string('title'); $table->string('summary')->nullable(); $table->longText('content'); $table->string('category')->default('General'); $table->enum('priority', ['normal','high'])->default('normal'); $table->boolean('is_featured')->default(false); $table->boolean('company_wide')->default(true); $table->date('starts_at'); $table->date('ends_at')->nullable(); $table->timestamps(); });
        Schema::create('announcement_branch', function (Blueprint $table) { $table->foreignId('announcement_id')->constrained()->cascadeOnDelete(); $table->foreignId('branch_id')->constrained()->cascadeOnDelete(); $table->primary(['announcement_id','branch_id']); });
        Schema::create('announcement_department', function (Blueprint $table) { $table->foreignId('announcement_id')->constrained()->cascadeOnDelete(); $table->foreignId('department_id')->constrained()->cascadeOnDelete(); $table->primary(['announcement_id','department_id']); });
        Schema::create('announcement_user', function (Blueprint $table) { $table->foreignId('announcement_id')->constrained()->cascadeOnDelete(); $table->foreignId('user_id')->constrained()->cascadeOnDelete(); $table->primary(['announcement_id','user_id']); });
        Schema::create('announcement_views', function (Blueprint $table) { $table->id(); $table->foreignId('announcement_id')->constrained()->cascadeOnDelete(); $table->foreignId('user_id')->constrained()->cascadeOnDelete(); $table->timestamp('viewed_at'); $table->unique(['announcement_id','user_id']); });
    }
    public function down(): void { Schema::dropIfExists('announcement_views'); Schema::dropIfExists('announcement_user'); Schema::dropIfExists('announcement_department'); Schema::dropIfExists('announcement_branch'); Schema::dropIfExists('announcements'); }
};
