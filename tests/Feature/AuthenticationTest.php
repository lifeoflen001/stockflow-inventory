<?php

namespace Tests\Feature;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\EmailVerificationCode;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use App\Mail\EmailVerificationMail;
use App\Mail\TestEmailMail;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_superuser_can_login_read_profile_and_logout(): void
    {
        $this->seed(DatabaseSeeder::class);
        $login = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!']);
        $login->assertOk()->assertJsonPath('user.role', 'super_admin');
        $token = $login->json('token');

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()->assertJsonPath('profile.email', 'admin@stockflow.local');
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'incorrect-password'])
            ->assertUnprocessable();
    }

    public function test_new_login_invalidates_the_previous_session_for_that_account(): void
    {
        $this->seed(DatabaseSeeder::class);
        $credentials = ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'];
        $firstToken = $this->postJson('/api/v1/auth/login', $credentials)->json('token');
        $secondToken = $this->postJson('/api/v1/auth/login', $credentials)->json('token');

        $this->withToken($firstToken)->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->withToken($secondToken)->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_new_account_requires_and_accepts_six_digit_email_verification(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $payload = ['name' => 'New Owner', 'email' => 'owner@example.com', 'password' => 'SecurePass123', 'password_confirmation' => 'SecurePass123', 'terms' => true];
        $this->postJson('/api/v1/auth/register', $payload)->assertCreated()->assertJsonPath('data.email', 'owner@example.com')->assertJsonPath('data.deliveryWarning', null);
        Mail::assertSent(EmailVerificationMail::class, fn (EmailVerificationMail $mail) => $mail->user->email === 'owner@example.com' && preg_match('/^\d{6}$/', $mail->code) === 1);
        $this->postJson('/api/v1/auth/login', ['email' => 'owner@example.com', 'password' => 'SecurePass123'])->assertForbidden();

        $user = User::where('email', 'owner@example.com')->firstOrFail();
        EmailVerificationCode::where('user_id', $user->id)->update(['code_hash' => hash('sha256', '123456')]);
        $this->postJson('/api/v1/auth/verify-email', ['email' => 'owner@example.com', 'code' => '123456'])->assertOk();
        $this->postJson('/api/v1/auth/login', ['email' => 'owner@example.com', 'password' => 'SecurePass123'])->assertOk();
    }

    public function test_user_can_reset_password_with_a_single_use_token(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $email = 'admin@stockflow.local';
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $email])->assertOk();
        DB::table('password_reset_tokens')->where('email', $email)->update(['token' => hash('sha256', 'known-token')]);
        $payload = ['email' => $email, 'token' => 'known-token', 'password' => 'NewSecurePass123', 'password_confirmation' => 'NewSecurePass123'];
        $this->postJson('/api/v1/auth/reset-password', $payload)->assertOk();
        $this->postJson('/api/v1/auth/reset-password', $payload)->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'NewSecurePass123'])->assertOk();
    }

    public function test_admin_can_test_saved_smtp_delivery_and_render_the_notification_template(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)->patchJson('/api/v1/settings/email', [
            'provider' => 'SMTP', 'driver' => 'smtp', 'host' => 'smtp.example.com', 'port' => 587,
            'username' => 'mailer@example.com', 'password' => 'app-password', 'encryption' => 'tls',
            'from_address' => 'mailer@example.com', 'from_name' => 'StockFlow Alerts',
        ])->assertOk();

        $this->withToken($token)->postJson('/api/v1/settings/email/test')->assertOk()->assertJsonPath('data.message', 'Test email sent to admin@stockflow.local.');
        Mail::assertSent(TestEmailMail::class, fn (TestEmailMail $mail) => $mail->hasTo('admin@stockflow.local') && str_contains($mail->render(), 'Email delivery is working'));
        $this->assertSame('smtp.example.com', config('mail.mailers.smtp.host'));
    }

    public function test_verification_delivery_recovers_from_legacy_host_saved_as_mail_driver(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        Organization::firstOrFail()->update(['settings' => [
            'email' => [
                'driver' => 'smtp.gmail.com',
                'host' => 'smtp.gmail.com',
                'port' => 587,
                'username' => 'mailer@example.com',
                'encryption' => 'tls',
                'from_address' => 'mailer@example.com',
                'from_name' => 'StockFlow',
            ],
        ]]);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Legacy Mail User', 'email' => 'legacy-mail@example.com',
            'password' => 'SecurePass123', 'password_confirmation' => 'SecurePass123', 'terms' => true,
        ])->assertCreated()->assertJsonPath('data.deliveryWarning', null);

        Mail::assertSent(EmailVerificationMail::class, fn (EmailVerificationMail $mail) => $mail->hasTo('legacy-mail@example.com'));
    }
}
