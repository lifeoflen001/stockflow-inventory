<?php

namespace Tests\Feature;

use App\Mail\HighPriorityAnnouncementMail;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AnnouncementTest extends TestCase
{
    use RefreshDatabase;

    public function test_high_priority_announcement_notifies_active_system_users_once(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $announcement = $this->withToken($token)->postJson('/api/v1/announcements', [
            'title' => 'Urgent stock notice', 'summary' => 'Immediate action is required.', 'content' => 'Please review the current stock position.',
            'category' => 'Operations', 'priority' => 'high', 'is_featured' => false, 'company_wide' => true, 'starts_at' => now()->toDateString(),
        ])->assertCreated();

        Mail::assertSentTimes(HighPriorityAnnouncementMail::class, 1);
        Mail::assertSent(HighPriorityAnnouncementMail::class, fn (HighPriorityAnnouncementMail $mail) => $mail->hasTo('admin@stockflow.local') && str_contains($mail->render(), 'Urgent stock notice'));

        $this->withToken($token)->patchJson('/api/v1/announcements/'.$announcement->json('data.id'), [
            'title' => 'Urgent stock notice updated', 'summary' => 'Immediate action is required.', 'content' => 'Please review the current stock position.',
            'category' => 'Operations', 'priority' => 'high', 'is_featured' => false, 'company_wide' => true, 'starts_at' => now()->toDateString(),
        ])->assertOk();
        Mail::assertSentTimes(HighPriorityAnnouncementMail::class, 1);
    }

    public function test_high_priority_announcement_creates_an_in_app_alert(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)->postJson('/api/v1/announcements', [
            'title' => 'Warehouse alert', 'summary' => 'Review the stock position before the next dispatch.', 'content' => 'Warehouse review is required.','category' => 'Operations', 'priority' => 'high', 'is_featured' => false, 'company_wide' => true, 'starts_at' => now()->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('app_notifications', ['title' => 'Warehouse alert', 'kind' => 'alert', 'user_id' => 1]);
        $this->withToken($token)->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('data.0.title', 'Warehouse alert')->assertJsonPath('meta.unread_count', 1);
        $notificationId = DB::table('app_notifications')->value('id');
        $this->withToken($token)->patchJson('/api/v1/notifications/'.$notificationId.'/read')->assertOk();
        $this->withToken($token)->getJson('/api/v1/notifications')->assertJsonPath('meta.unread_count', 0);
    }
}
