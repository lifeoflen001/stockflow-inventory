<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Mail\PasswordResetMail;
use App\Services\MailDeliveryService;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class PasswordResetController extends Controller
{
    public function requestLink(Request $request, MailDeliveryService $delivery): JsonResponse
    {
        $data = $request->validate(['email' => ['required','email']]); $email = Str::lower($data['email']); $user = User::where('email', $email)->where('is_active', true)->first();
        if ($user) {
            $token = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(['email' => $email], ['token' => hash('sha256', $token), 'created_at' => now()]);
            $frontend = rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/');
            $url = $frontend.'/reset-password?email='.urlencode($email).'&token='.urlencode($token);
            try {
                $delivery->send($user->organization, $user->email, $user->name, new PasswordResetMail($user, $url));
            } catch (\Throwable $exception) {
                report($exception);
                DB::table('password_reset_tokens')->where('email', $email)->delete();
            }
        }
        return ApiResponse::success(['message' => 'If an account exists for that email, a password reset link has been sent.']);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required','email'], 'token' => ['required','string'], 'password' => ['required','confirmed',Password::min(10)->letters()->numbers()]]); $email = Str::lower($data['email']); $record = DB::table('password_reset_tokens')->where('email', $email)->first();
        if (! $record || ! hash_equals($record->token, hash('sha256', $data['token'])) || now()->diffInMinutes($record->created_at, true) > 60) return ApiResponse::error('This password reset link is invalid or has expired.', 422, ['token' => ['Request a new password reset link.']]);
        $user = User::where('email', $email)->firstOrFail(); DB::transaction(function () use ($user, $email, $data) { $user->update(['password' => Hash::make($data['password'])]); $user->apiTokens()->delete(); DB::table('password_reset_tokens')->where('email', $email)->delete(); });
        return ApiResponse::success(['message' => 'Your password has been reset successfully.']);
    }
}
