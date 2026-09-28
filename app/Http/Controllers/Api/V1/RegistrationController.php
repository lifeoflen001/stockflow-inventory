<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Models\EmailVerificationCode;
use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use App\Services\EmailVerificationService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use RuntimeException;

class RegistrationController extends Controller
{
    public function register(Request $request, EmailVerificationService $verification): JsonResponse
    {
        $data = $request->validate(['name' => ['required','string','max:255'], 'email' => ['required','email','max:255','unique:users,email'], 'password' => ['required','confirmed',Password::min(10)->letters()->numbers()], 'terms' => ['accepted']]);
        $user = DB::transaction(function () use ($data) { $organization = Organization::create(['name' => $data['name'].' Organization', 'code' => str()->upper(str()->random(10)), 'is_active' => true]); $user = User::create(['organization_id' => $organization->id, 'name' => $data['name'], 'email' => str()->lower($data['email']), 'password' => $data['password'], 'is_active' => true]); $role = Role::where('name', 'super_admin')->firstOrFail(); $user->roles()->attach($role->id, ['organization_id' => $organization->id]); return $user; });
        $deliveryWarning = null;
        try {
            $verification->send($user);
        } catch (RuntimeException $exception) {
            report($exception);
            $deliveryWarning = 'Your account was created, but the verification email could not be sent. Check your email settings, then use Resend code.';
        }

        return ApiResponse::success([
            'email' => $user->email,
            'message' => $deliveryWarning ?? 'Account created. Check your email for the verification code.',
            'deliveryWarning' => $deliveryWarning,
        ], 201);
    }

    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required','email'], 'code' => ['required','digits:6']]); $user = User::where('email', str()->lower($data['email']))->first(); $record = $user ? EmailVerificationCode::where('user_id', $user->id)->first() : null;
        if (! $record || $record->expires_at->isPast() || $record->attempts >= 5 || ! hash_equals($record->code_hash, hash('sha256', $data['code']))) { if ($record) $record->increment('attempts'); return ApiResponse::error('The verification code is invalid or has expired.', 422, ['code' => ['Enter a valid six-digit code.']]); }
        $user->forceFill(['email_verified_at' => now()])->save(); $record->delete(); return ApiResponse::success(['message' => 'Email verified successfully. You can now sign in.']);
    }

    public function resend(Request $request, EmailVerificationService $verification): JsonResponse
    {
        $data = $request->validate(['email' => ['required','email']]); $user = User::where('email', str()->lower($data['email']))->first();
        if ($user && ! $user->email_verified_at) {
            $record = EmailVerificationCode::where('user_id', $user->id)->first();
            if ($record && $record->last_sent_at->gt(now()->subMinute())) return ApiResponse::error('Please wait before requesting another code.', 429);
            try {
                $verification->send($user);
            } catch (RuntimeException $exception) {
                report($exception);
                return ApiResponse::error($exception->getMessage(), 503);
            }
        }
        return ApiResponse::success(['message' => 'If the account exists, a new code has been sent.']);
    }
}
