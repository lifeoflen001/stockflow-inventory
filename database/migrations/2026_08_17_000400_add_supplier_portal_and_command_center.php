<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('currency', 3)->default('TZS')->after('payment_terms');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->after('department_id')->constrained('suppliers')->nullOnDelete();
            $table->index(['organization_id', 'supplier_id']);
        });

        Schema::table('user_invitations', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->after('department_id')->constrained('suppliers')->nullOnDelete();
        });

        Schema::table('purchase_order_documents', function (Blueprint $table) {
            $table->string('visibility', 20)->default('internal')->after('type');
            $table->index(['purchase_order_id', 'visibility']);
        });

        Schema::create('supplier_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->string('name');
            $table->string('role')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['supplier_id', 'role']);
        });

        Schema::create('supplier_commercial_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->unique()->constrained('suppliers')->cascadeOnDelete();
            $table->string('currency', 3)->default('TZS');
            $table->string('payment_terms')->nullable();
            $table->decimal('minimum_order_quantity', 15, 3)->nullable();
            $table->string('preferred_shipping_method')->nullable();
            $table->json('pricing_tiers')->nullable();
            $table->json('volume_discounts')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('supplier_product_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('supplier_sku');
            $table->string('supplier_part_number')->nullable();
            $table->string('supplier_description')->nullable();
            $table->decimal('unit_conversion', 15, 6)->default(1);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['supplier_id', 'supplier_sku']);
        });

        Schema::create('supplier_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 40);
            $table->string('title');
            $table->string('original_name');
            $table->string('disk')->default('local');
            $table->string('path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->date('expires_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['supplier_id', 'type', 'expires_at']);
        });

        Schema::create('supplier_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->string('return_number');
            $table->string('status')->default('open');
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('reason')->nullable();
            $table->date('returned_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['supplier_id', 'return_number']);
        });

        foreach ([
            ['name' => 'supplier_orders.view', 'group' => 'supplier_portal'],
            ['name' => 'supplier_orders.respond', 'group' => 'supplier_portal'],
            ['name' => 'supplier_documents.upload', 'group' => 'supplier_portal'],
        ] as $permission) {
            DB::table('permissions')->updateOrInsert(['name' => $permission['name']], $permission + ['created_at' => now(), 'updated_at' => now()]);
        }

        DB::table('roles')->updateOrInsert(['name' => 'supplier'], ['label' => 'Supplier', 'updated_at' => now(), 'created_at' => now()]);
        $roleId = DB::table('roles')->where('name', 'supplier')->value('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['supplier_orders.view', 'supplier_orders.respond', 'supplier_documents.upload'])->pluck('id');
        foreach ($permissionIds as $permissionId) {
            DB::table('permission_role')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('name', 'supplier')->value('id');
        if ($roleId) {
            DB::table('permission_role')->where('role_id', $roleId)->delete();
            DB::table('roles')->where('id', $roleId)->delete();
        }
        DB::table('permissions')->whereIn('name', ['supplier_orders.view', 'supplier_orders.respond', 'supplier_documents.upload'])->delete();
        Schema::dropIfExists('supplier_returns');
        Schema::dropIfExists('supplier_documents');
        Schema::dropIfExists('supplier_product_mappings');
        Schema::dropIfExists('supplier_commercial_terms');
        Schema::dropIfExists('supplier_contacts');
        Schema::table('purchase_order_documents', function (Blueprint $table) { $table->dropIndex(['purchase_order_id', 'visibility']); $table->dropColumn('visibility'); });
        Schema::table('user_invitations', function (Blueprint $table) { $table->dropForeign(['supplier_id']); $table->dropColumn('supplier_id'); });
        Schema::table('users', function (Blueprint $table) { $table->dropForeign(['supplier_id']); $table->dropIndex(['organization_id', 'supplier_id']); $table->dropColumn('supplier_id'); });
        Schema::table('suppliers', function (Blueprint $table) { $table->dropColumn('currency'); });
    }
};
