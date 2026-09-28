<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use App\Support\ApiResponse;
use App\Services\OrganizationSettingsService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plainToken = $request->bearerToken();
        if (! $plainToken) return ApiResponse::error('Unauthenticated.', 401);

        $token = ApiToken::query()->with(['user.roles.permissions', 'user.permissionOverrides', 'user.organization', 'user.department', 'user.supplier'])->where('token_hash', hash('sha256', $plainToken))->first();
        if (! $token || $token->expires_at->isPast() || ! $token->user->is_active) {
            return ApiResponse::error('Your session is invalid or has expired.', 401);
        }

        // This is telemetry, not request state. Avoid a database write on
        // every read request while still keeping the session activity useful.
        if (! $token->last_used_at || $token->last_used_at->lt(now()->subMinutes(5))) {
            $token->forceFill(['last_used_at' => now()])->saveQuietly();
        }
        $request->attributes->set('api_token', $token);
        Auth::setUser($token->user);
        app(OrganizationSettingsService::class)->apply($token->user->organization);
        return $next($request);
    }
}
