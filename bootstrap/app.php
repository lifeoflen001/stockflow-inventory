<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'api.token' => \App\Http\Middleware\AuthenticateApiToken::class,
            'permission' => \App\Http\Middleware\RequirePermission::class,
            'permission_any' => \App\Http\Middleware\RequireAnyPermission::class,
            'audit.api' => \App\Http\Middleware\AuditApiRequest::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (Throwable $exception, Request $request) {
            if ($request->is('api/*') && config('app.debug')) {
                return response()->json([
                    'message' => $exception->getMessage(),
                    'exception' => $exception::class,
                ], 500);
            }

            return null;
        });
    })->create();
