<?php

namespace Tests\Feature;

use App\Mail\HighPriorityAnnouncementMail;
use App\Models\Organization;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SystemSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function token(): string
    {
        $this->seed(DatabaseSeeder::class);

        return $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stockflow.local',
            'password' => 'StockFlow@2026!',
        ])->json('token');
    }

    public function test_general_settings_persist_and_apply_to_authenticated_requests(): void
    {
        $token = $this->token();

        $this->withToken($token)->patchJson('/api/v1/settings', [
            'name' => 'NeatNest Organized Inventories',
            'currency' => 'USD',
            'timezone' => 'Africa/Nairobi',
            'date_format' => 'Y-m-d',
            'low_stock_notifications' => false,
            'email_notifications' => false,
        ])->assertOk()
            ->assertJsonPath('data.name', 'NeatNest Organized Inventories')
            ->assertJsonPath('data.settings.currency', 'USD')
            ->assertJsonPath('data.settings.timezone', 'Africa/Nairobi')
            ->assertJsonPath('data.settings.date_format', 'Y-m-d')
            ->assertJsonPath('data.settings.low_stock_notifications', false)
            ->assertJsonPath('data.settings.email_notifications', false);

        $this->assertDatabaseHas('organizations', [
            'id' => 1,
            'name' => 'NeatNest Organized Inventories',
            'currency' => 'USD',
            'timezone' => 'Africa/Nairobi',
        ]);
        $this->assertSame('Africa/Nairobi', config('app.timezone'));
        $this->assertSame('Africa/Nairobi', date_default_timezone_get());
    }

    public function test_email_notifications_setting_suppresses_high_priority_alerts(): void
    {
        Mail::fake();
        $token = $this->token();

        $this->withToken($token)->patchJson('/api/v1/settings', [
            'name' => 'StockFlow',
            'currency' => 'TSHS',
            'timezone' => 'Africa/Dar_es_Salaam',
            'date_format' => 'd/m/Y',
            'low_stock_notifications' => true,
            'email_notifications' => false,
        ])->assertOk();

        $this->withToken($token)->postJson('/api/v1/announcements', [
            'title' => 'Suppressed alert', 'summary' => 'No email expected.', 'content' => 'This remains in-app.',
            'category' => 'Operations', 'priority' => 'high', 'is_featured' => false, 'company_wide' => true,
            'starts_at' => now()->toDateString(),
        ])->assertCreated();

        Mail::assertNotSent(HighPriorityAnnouncementMail::class);
    }

    public function test_recaptcha_and_cookie_settings_are_saved_without_exposing_secret(): void
    {
        $token = $this->token();

        $this->withToken($token)->patchJson('/api/v1/settings/recaptcha', [
            'enabled' => true, 'version' => 'v3', 'site_key' => 'site-key', 'secret_key' => 'private-secret',
        ])->assertOk()->assertJsonPath('data.settings.recaptcha.enabled', true)
            ->assertJsonPath('data.settings.recaptcha.site_key', 'site-key')
            ->assertJsonPath('data.settings.recaptcha.secret_configured', true)
            ->assertJsonPath('data.settings.recaptcha.secret_key', '');

        $this->withToken($token)->patchJson('/api/v1/settings/cookie', [
            'logging' => false, 'title' => 'Privacy choices', 'description' => 'Choose your preferences.',
            'strict_title' => 'Required cookies', 'strict_description' => 'Required for sign-in.',
            'contact_description' => 'Contact support.', 'contact_url' => 'https://example.com/contact',
        ])->assertOk()->assertJsonPath('data.settings.cookie.logging', false)
            ->assertJsonPath('data.settings.cookie.contact_url', 'https://example.com/contact');

        $stored = Organization::firstOrFail()->settings;
        $this->assertNotSame('private-secret', data_get($stored, 'recaptcha.secret_key'));
    }
}
