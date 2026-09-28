<?php

namespace App\Services;

use App\Models\Organization;

class OrganizationSettingsService
{
    public function all(?Organization $organization): array
    {
        $settings = array_replace_recursive($this->defaults(), $organization?->settings ?? []);
        if ($organization?->currency) $settings['currency'] = $organization->currency;
        if ($organization?->timezone) $settings['timezone'] = data_get($organization->settings ?? [], 'timezone', $organization->timezone);
        return $settings;
    }

    public function apply(?Organization $organization): void
    {
        $timezone = (string) data_get($this->all($organization), 'timezone', config('app.timezone', 'UTC'));
        if (! in_array($timezone, timezone_identifiers_list(), true)) {
            $timezone = (string) config('app.timezone', 'UTC');
        }
        config(['app.timezone' => $timezone]);
        date_default_timezone_set($timezone);
    }

    public function enabled(?Organization $organization, string $setting, bool $default = true): bool
    {
        return (bool) data_get($this->all($organization), $setting, $default);
    }

    public function defaults(): array
    {
        return [
            'currency' => 'TSHS',
            'timezone' => 'Africa/Dar_es_Salaam',
            'date_format' => 'd/m/Y',
            'low_stock_notifications' => true,
            'email_notifications' => true,
            'email' => ['provider' => 'SMTP', 'driver' => (string) config('mail.default', 'smtp'), 'host' => (string) config('mail.mailers.smtp.host', ''), 'port' => (int) config('mail.mailers.smtp.port', 587), 'username' => (string) config('mail.mailers.smtp.username', ''), 'encryption' => config('mail.mailers.smtp.scheme') === 'smtps' ? 'ssl' : 'tls', 'from_address' => (string) config('mail.from.address', ''), 'from_name' => (string) config('mail.from.name', config('app.name', 'StockFlow'))],
            'recaptcha' => ['enabled' => false, 'version' => 'v2', 'site_key' => ''],
            'cookie' => ['logging' => true, 'title' => 'Cookie Consent', 'description' => 'We use cookies to enhance your experience and provide personalized content.', 'strict_title' => 'Strictly Necessary Cookies', 'strict_description' => 'These cookies are essential for the application to function properly.', 'contact_description' => 'If you have questions about our cookie policy, please contact us.', 'contact_url' => 'http://localhost/contact'],
        ];
    }
}
