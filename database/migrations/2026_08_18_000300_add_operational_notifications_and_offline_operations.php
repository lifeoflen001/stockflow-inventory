<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // This migration was previously able to create part of its schema before
        // failing. Keep the retry safe so existing tables and data are preserved.
        if (Schema::hasTable('app_notifications')) {
            $missingNotificationColumns = collect([
                'event_type',
                'severity',
                'related_type',
                'related_id',
                'dedupe_key',
                'delivery_status',
                'delivery_attempts',
                'delivered_at',
                'failure_reason',
            ])->filter(fn (string $column): bool => ! Schema::hasColumn('app_notifications', $column));

            if ($missingNotificationColumns->isNotEmpty()) {
                Schema::table('app_notifications', function (Blueprint $table) use ($missingNotificationColumns) {
                    if ($missingNotificationColumns->contains('event_type')) {
                        $table->string('event_type', 100)->nullable()->after('kind');
                    }
                    if ($missingNotificationColumns->contains('severity')) {
                        $table->string('severity', 20)->default('info')->after('event_type');
                    }
                    if ($missingNotificationColumns->contains('related_type')) {
                        $table->string('related_type', 120)->nullable()->after('icon');
                    }
                    if ($missingNotificationColumns->contains('related_id')) {
                        $table->unsignedBigInteger('related_id')->nullable()->after('related_type');
                    }
                    if ($missingNotificationColumns->contains('dedupe_key')) {
                        $table->string('dedupe_key', 190)->nullable()->after('related_id');
                    }
                    if ($missingNotificationColumns->contains('delivery_status')) {
                        $table->string('delivery_status', 20)->default('delivered')->after('dedupe_key');
                    }
                    if ($missingNotificationColumns->contains('delivery_attempts')) {
                        $table->unsignedInteger('delivery_attempts')->default(0)->after('delivery_status');
                    }
                    if ($missingNotificationColumns->contains('delivered_at')) {
                        $table->timestamp('delivered_at')->nullable()->after('delivery_attempts');
                    }
                    if ($missingNotificationColumns->contains('failure_reason')) {
                        $table->text('failure_reason')->nullable()->after('delivered_at');
                    }
                });
            }

            foreach ([
                ['organization_id', 'event_type', 'created_at'],
                ['user_id', 'read_at', 'severity'],
                ['organization_id', 'user_id', 'dedupe_key'],
            ] as $columns) {
                if (! Schema::hasIndex('app_notifications', $columns)) {
                    Schema::table('app_notifications', fn (Blueprint $table) => $table->index($columns));
                }
            }
        }

        if (! Schema::hasTable('notification_deliveries')) {
            Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_notification_id')->constrained('app_notifications')->cascadeOnDelete();
            $table->string('channel', 30);
            $table->string('status', 20)->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
            $table->unique(['app_notification_id', 'channel']);
            $table->index(['channel', 'status']);
            });
        }

        if (! Schema::hasTable('notification_rules')) {
            Schema::create('notification_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 100);
            $table->boolean('enabled')->default(true);
            $table->string('severity', 20)->default('info');
            $table->json('recipients')->nullable();
            $table->json('channels')->nullable();
            $table->boolean('mandatory')->default(false);
            $table->unsignedInteger('rate_limit_per_hour')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'event_type']);
            });
        }

        if (! Schema::hasTable('user_notification_preferences')) {
            Schema::create('user_notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 100);
            $table->string('channel', 30);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'user_id', 'event_type', 'channel'], 'user_notification_preferences_unique');
            });
        }

        if (Schema::hasTable('products') && ! Schema::hasColumn('products', 'expires_at')) {
            Schema::table('products', function (Blueprint $table) {
                $table->date('expires_at')->nullable()->after('is_active');
            });
        }
        if (Schema::hasTable('products') && ! Schema::hasIndex('products', ['organization_id', 'expires_at'])) {
            Schema::table('products', fn (Blueprint $table) => $table->index(['organization_id', 'expires_at']));
        }

        if (! Schema::hasTable('offline_operations')) {
            Schema::create('offline_operations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('operation_id', 100)->unique();
            $table->string('device_id', 160);
            $table->string('operation_type', 60);
            $table->string('status', 20)->default('pending');
            $table->json('payload');
            $table->json('result')->nullable();
            $table->json('base_versions')->nullable();
            $table->timestamp('client_created_at')->nullable();
            $table->timestamp('server_processed_at')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->json('conflict_data')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'user_id', 'status']);
            $table->index(['organization_id', 'operation_type', 'created_at'], 'offline_org_type_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('offline_operations');
        Schema::dropIfExists('user_notification_preferences');
        Schema::dropIfExists('notification_rules');
        Schema::dropIfExists('notification_deliveries');
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'event_type', 'created_at']);
            $table->dropIndex(['user_id', 'read_at', 'severity']);
            $table->dropIndex(['organization_id', 'user_id', 'dedupe_key']);
            $table->dropColumn(['event_type', 'severity', 'related_type', 'related_id', 'dedupe_key', 'delivery_status', 'delivery_attempts', 'delivered_at', 'failure_reason']);
        });
        if (Schema::hasColumn('products', 'expires_at')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropIndex(['organization_id', 'expires_at']);
                $table->dropColumn('expires_at');
            });
        }
    }
};
