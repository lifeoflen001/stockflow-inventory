<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\ApiToken;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        try {
            $email = $request->string('email')->toString();
            $password = $request->string('password')->toString();
            $user = User::query()->with('organization', 'roles', 'department', 'supplier', 'permissionOverrides')->where('email', $email)->first();
            if (! $user || ! $user->is_active || ! Hash::check($password, $user->password)) {
                return ApiResponse::error('Invalid email or password.', 422, ['email' => ['The entered credentials do not much our records.']]);
            }
            if (! $user->email_verified_at) return ApiResponse::error('Verify your email before signing in.', 403, ['email' => ['Email verification is required.']]);

            $plainToken = Str::random(80);
            // Keep one active browser session per account. This also invalidates
            // sessions left behind on a shared or lost device.
            $user->apiTokens()->delete();
            ApiToken::create([
                'user_id' => $user->id,
                'name' => 'web',
                'token_hash' => hash('sha256', $plainToken),
                'expires_at' => now()->addHours(12),
            ]);
            $user->forceFill(['last_login_at' => now()])->save();

            return response()->json(['token' => $plainToken, 'user' => $this->userPayload($user)]);
        } catch (\Throwable $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'exception' => $exception::class,
            ], 500);
        }
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->userPayload($request->user()->loadMissing('organization', 'roles', 'department', 'supplier', 'permissionOverrides')));
    }

    public function unlock(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! Hash::check($request->string('password')->toString(), $user->password)) {
            return ApiResponse::error('Incorrect password. Please try again.', 422, ['password' => ['The password is incorrect.']]);
        }

        return response()->json(['user' => $this->userPayload($user->loadMissing('organization', 'roles', 'department', 'supplier', 'permissionOverrides'))]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->attributes->get('api_token')?->delete();
        return response()->json(null, 204);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'role' => $user->primaryRole() ?? 'store_keeper',
            'profile' => ['name' => $user->name, 'email' => $user->email, 'phone' => $user->phone, 'avatarUrl' => $user->avatar_path ? '/storage/'.$user->avatar_path : null, 'signatureUrl' => $user->signature_path ? '/storage/'.$user->signature_path : null],
            'organization' => $user->organization ? ['id' => (string) $user->organization->id, 'name' => $user->organization->name, 'currency' => $user->organization->currency] : null,
            'department' => $user->department ? ['id' => (string) $user->department->id, 'name' => $user->department->name, 'code' => $user->department->code] : null,
            'supplier' => $user->supplier ? ['id' => (string) $user->supplier->id, 'name' => $user->supplier->name] : null,
            'permissions' => $user->effectivePermissionNames(),
        ];
    }
}
