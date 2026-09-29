<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

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
    ->create();
