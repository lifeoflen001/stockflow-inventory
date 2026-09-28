<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class MailDeliveryService
{
    public function configure(?Organization $organization = null): void
    {
        $settings = (array) data_get($organization?->settings ?? [], 'email', []);
        $base = (array) config('mail.mailers.smtp', []);
        $fromAddress = (string) (filled($settings['from_address'] ?? null) ? $settings['from_address'] : config('mail.from.address', ''));
        $password = (string) ($base['password'] ?? '');

        if (! empty($settings['password_encrypted'])) {
            try {
                $password = Crypt::decryptString($settings['password_encrypted']);
            } catch (Throwable) {
                throw new RuntimeException('The saved email password could not be decrypted. Save the email settings again.');
            }
        }

        $configuredDriver = strtolower(trim((string) ($settings['driver'] ?? '')));
        // Older settings allowed a free-text driver and some records contain the
        // SMTP host here. Treat that legacy value as SMTP so existing accounts
        // can recover without manually editing the database.
        $driver = in_array($configuredDriver, ['smtp', 'log', 'array'], true)
            ? $configuredDriver
            : 'smtp';

        $host = (string) (filled($settings['host'] ?? null) ? $settings['host'] : ($base['host'] ?? ''));
        $ehloDomain = (string) (env('MAIL_EHLO_DOMAIN') ?: (Str::contains($fromAddress, '@') ? Str::afterLast($fromAddress, '@') : parse_url((string) config('app.url'), PHP_URL_HOST)));
        $scheme = ($settings['encryption'] ?? null) === 'ssl' ? 'smtps' : null;

        config([
            'mail.default' => $driver,
            'mail.from.address' => $fromAddress,
            'mail.from.name' => (string) ($settings['from_name'] ?? config('mail.from.name', config('app.name'))),
            'mail.mailers.smtp' => array_merge($base, [
                'transport' => 'smtp',
                'scheme' => $scheme,
                'host' => $host,
                'port' => (int) (! empty($settings['port']) ? $settings['port'] : ($base['port'] ?? 587)),
                'username' => filled($settings['username'] ?? null) ? $settings['username'] : ($base['username'] ?? null),
                'password' => $password,
                'local_domain' => $ehloDomain ?: null,
            ]),
        ]);
    }

    public function send(Organization $organization, string $email, ?string $name, Mailable $mailable): void
    {
        $this->configure($organization);

        if (app()->environment('production') && config('mail.default') === 'log') {
            throw new RuntimeException('Outbound email is disabled because the mail driver is set to log. Configure SMTP before sending email.');
        }

        Mail::to($email, $name)->send($mailable);
    }
}
