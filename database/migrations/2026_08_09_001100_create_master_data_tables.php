<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::create('categories', function(Blueprint $t){$t->id();$t->foreignId('organization_id')->constrained()->cascadeOnDelete();$t->string('name');$t->text('description')->nullable();$t->string('color',20)->nullable();$t->boolean('is_active')->default(true);$t->timestamps();$t->unique(['organization_id','name']);});
  Schema::create('units', function(Blueprint $t){$t->id();$t->foreignId('organization_id')->constrained()->cascadeOnDelete();$t->string('name');$t->string('abbreviation',20);$t->timestamps();$t->unique(['organization_id','name']);});
  Schema::create('products', function(Blueprint $t){$t->id();$t->foreignId('organization_id')->constrained()->cascadeOnDelete();$t->foreignId('category_id')->nullable()->constrained()->nullOnDelete();$t->foreignId('unit_id')->nullable()->constrained()->nullOnDelete();$t->string('sku');$t->string('name');$t->text('description')->nullable();$t->decimal('cost_price',15,2)->default(0);$t->decimal('selling_price',15,2)->default(0);$t->decimal('tax_rate',7,3)->default(0);$t->decimal('reorder_level',15,3)->default(0);$t->string('barcode')->nullable();$t->string('image_url')->nullable();$t->json('tags')->nullable();$t->boolean('is_active')->default(true);$t->timestamps();$t->unique(['organization_id','sku']);});
  Schema::create('suppliers', function(Blueprint $t){$t->id();$t->foreignId('organization_id')->constrained()->cascadeOnDelete();$t->string('name');$t->string('contact_person')->nullable();$t->string('email')->nullable();$t->string('phone')->nullable();$t->text('address')->nullable();$t->string('city')->nullable();$t->string('country')->nullable();$t->string('tax_id')->nullable();$t->string('payment_terms')->nullable();$t->text('notes')->nullable();$t->decimal('rating',3,2)->default(5);$t->boolean('is_active')->default(true);$t->timestamps();});
  Schema::create('customers', function(Blueprint $t){$t->id();$t->foreignId('organization_id')->constrained()->cascadeOnDelete();$t->string('name');$t->string('email')->nullable();$t->string('phone')->nullable();$t->text('address')->nullable();$t->string('city')->nullable();$t->string('country')->nullable();$t->string('tax_id')->nullable();$t->enum('customer_type',['retail','wholesale'])->default('retail');$t->decimal('credit_limit',15,2)->default(0);$t->decimal('discount_rate',7,3)->default(0);$t->boolean('is_active')->default(true);$t->timestamps();});
 }
 public function down(): void {Schema::dropIfExists('customers');Schema::dropIfExists('suppliers');Schema::dropIfExists('products');Schema::dropIfExists('units');Schema::dropIfExists('categories');}
};
