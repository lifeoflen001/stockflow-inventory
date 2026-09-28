<?php
namespace App\Services;

use App\Mail\EmailVerificationMail;
use App\Models\EmailVerificationCode;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class EmailVerificationService
{
    public function __construct(private MailDeliveryService $delivery) {}

    public function send(User $user): void
    {
        $code = (string) random_int(100000, 999999);
        $record = EmailVerificationCode::updateOrCreate(
            ['user_id' => $user->id],
            [
                'code_hash' => hash('sha256', $code),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(10),
                'last_sent_at' => now(),
            ],
        );

        try {
            $this->delivery->send($user->organization, $user->email, $user->name, new EmailVerificationMail($user, $code));
        } catch (Throwable $exception) {
            $record->delete();
            Log::error('Verification email delivery failed.', [
                'user_id' => $user->id,
                'email' => $user->email,
                'mailer' => config('mail.default'),
                'host' => config('mail.mailers.smtp.host'),
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            throw new RuntimeException('The verification email could not be sent. Check the outbound email settings and try again.', 0, $exception);
        }
    }
}
