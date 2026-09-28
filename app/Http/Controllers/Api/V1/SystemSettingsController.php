<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use App\Mail\TestEmailMail;
use App\Services\MailDeliveryService;
use App\Services\OrganizationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class SystemSettingsController extends Controller
{
    public function show(Request $request, ?OrganizationSettingsService $settingsService = null): JsonResponse
    {
        $settingsService ??= app(OrganizationSettingsService::class);
        $organization = $request->user()->organization;
        $settings = $settingsService->all($organization);
        $settings['email']['password'] = '';
        $settings['email']['password_configured'] = ! empty(($organization->settings ?? [])['email']['password_encrypted']) || ! empty(config('mail.mailers.smtp.password'));
        $settings['recaptcha']['secret_key'] = '';
        $settings['recaptcha']['secret_configured'] = ! empty(($organization->settings ?? [])['recaptcha']['secret_encrypted']);
        return ApiResponse::success(['name' => $organization->name, 'settings' => $settings]);
    }

    public function updateSection(Request $request, string $section): JsonResponse
    {
        abort_unless(in_array($section, ['email', 'recaptcha', 'cookie'], true), 404);
        $rules = match ($section) {
            'email' => ['provider' => ['required', 'string'], 'driver' => ['required', Rule::in(['smtp', 'log', 'array'])], 'host' => ['required', 'string'], 'port' => ['required', 'integer', 'between:1,65535'], 'username' => ['nullable', 'string'], 'password' => ['nullable', 'string'], 'encryption' => ['nullable', Rule::in(['tls', 'ssl', 'none'])], 'from_address' => ['required', 'email'], 'from_name' => ['required', 'string', 'max:255']],
            'recaptcha' => ['enabled' => ['required', 'boolean'], 'version' => ['required', Rule::in(['v2', 'v3'])], 'site_key' => ['nullable', 'string'], 'secret_key' => ['nullable', 'string']],
            'cookie' => ['logging' => ['required', 'boolean'], 'title' => ['required', 'string', 'max:255'], 'description' => ['required', 'string', 'max:2000'], 'strict_title' => ['required', 'string', 'max:255'], 'strict_description' => ['required', 'string', 'max:2000'], 'contact_description' => ['required', 'string', 'max:2000'], 'contact_url' => ['required', 'url']],
        };
        $data = $request->validate($rules);
        $organization = $request->user()->organization;
        $settings = $organization->settings ?? [];
        if ($section === 'email' && ! empty($data['password'])) { $data['password_encrypted'] = Crypt::encryptString($data['password']); }
        if ($section === 'recaptcha' && ! empty($data['secret_key'])) { $data['secret_encrypted'] = Crypt::encryptString($data['secret_key']); }
        unset($data['password'], $data['secret_key']);
        $settings[$section] = array_merge($settings[$section] ?? [], $data);
        $organization->update(['settings' => $settings]);
        return $this->show($request);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'currency' => ['required', Rule::in(['TSHS', 'USD'])],
            'timezone' => ['required', 'timezone'],
            'date_format' => ['required', Rule::in(['Y-m-d', 'd/m/Y', 'm/d/Y'])],
            'low_stock_notifications' => ['required', 'boolean'],
            'email_notifications' => ['required', 'boolean'],
        ]);
        $organization = $request->user()->organization;
        $organization->update([
            'name' => $data['name'],
            'currency' => $data['currency'],
            'timezone' => $data['timezone'],
            'settings' => array_merge($organization->settings ?? [], collect($data)->except('name')->all()),
        ]);
        app(OrganizationSettingsService::class)->apply($organization->fresh());
        return $this->show($request);
    }

    public function clearCache(): JsonResponse
    {
        Cache::flush();
        return ApiResponse::success(['message' => 'Application cache cleared successfully.']);
    }

    public function testEmail(Request $request, MailDeliveryService $delivery): JsonResponse
    {
        $user = $request->user();

        try {
            $delivery->send($user->organization, $user->email, $user->name, new TestEmailMail($user->name));
        } catch (Throwable $exception) {
            report($exception);
            return ApiResponse::error('The test email could not be sent. Verify the SMTP host, port, credentials and sender address.', 503);
        }

        return ApiResponse::success(['message' => 'Test email sent to '.$user->email.'.']);
    }

}
