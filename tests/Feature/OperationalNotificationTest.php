<?php

namespace Tests\Feature;

use App\Models\{AppNotification, NotificationRule, UserNotificationPreference};
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class OperationalNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_operational_notifications_are_deduplicated_and_can_be_marked_read(): void
    {
        $this->seed();
        $admin = \App\Models\User::where('email', 'admin@stockflow.local')->firstOrFail();
        $notifications = app(NotificationService::class);
        $payload = ['title' => 'Low stock', 'message' => 'A product is below its reorder level.'];
        $this->assertSame(1, $notifications->emit($admin->organization_id, 'low_stock', $payload, 'test:low-stock', collect([$admin])));
        $this->assertSame(0, $notifications->emit($admin->organization_id, 'low_stock', $payload, 'test:low-stock', collect([$admin])));
        $notification = AppNotification::query()->where('user_id', $admin->id)->where('dedupe_key', 'test:low-stock')->firstOrFail();
        $token = $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => 'Bearer '.$token];
        $this->patchJson('/api/v1/notifications/'.$notification->id.'/read', [], $headers)->assertOk()->assertJsonPath('data.readAt', fn ($value) => is_string($value));
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_critical_preference_cannot_be_disabled_and_email_delivery_is_queued(): void
    {
        $this->seed(); Queue::fake();
        $admin = \App\Models\User::where('email', 'admin@stockflow.local')->firstOrFail();
        NotificationRule::create(['organization_id' => $admin->organization_id, 'event_type' => 'critical_stock', 'enabled' => true, 'severity' => 'critical', 'recipients' => ['user_ids' => [$admin->id]], 'channels' => ['in_app', 'email'], 'mandatory' => true]);
        $token = $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => 'Bearer '.$token];
        $this->patchJson('/api/v1/notifications/preferences/critical_stock', ['channel' => 'email', 'enabled' => false], $headers)->assertUnprocessable();
        app(NotificationService::class)->emit($admin->organization_id, 'critical_stock', ['title' => 'Critical', 'message' => 'Immediate action required.'], 'test:critical', collect([$admin]));
        Queue::assertPushed(\App\Jobs\DeliverNotificationJob::class);
        $this->assertDatabaseHas('notification_deliveries', ['channel' => 'email', 'status' => 'pending']);
        $this->assertDatabaseMissing('user_notification_preferences', ['event_type' => 'critical_stock', 'channel' => 'email', 'enabled' => false]);
    }
}
