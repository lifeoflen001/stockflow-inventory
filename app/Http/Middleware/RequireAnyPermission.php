<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RequireAnyPermission
{
    public function handle(Request $request, Closure $next, ...$permissions)
    {
        abort_unless(collect($permissions)->contains(fn (string $permission) => $request->user()?->hasPermission($permission)), 403, 'You are not authorized to access this resource.');
        return $next($request);
    }
}
