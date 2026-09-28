<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use App\Services\NotificationService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AuditApiRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $correlationId = $request->header('X-Correlation-ID', (string) Str::uuid());
        $response = $next($request);
        $response->headers->set('X-Correlation-ID', $correlationId);

        if (! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            try {
                AuditLog::create([
                    'organization_id' => $request->user()?->organization_id,
                    'user_id' => $request->user()?->id,
                    'action' => $request->route()?->getName() ?? $request->path(),
                    'method' => $request->method(),
                    'path' => $request->path(),
                    'status_code' => $response->getStatusCode(),
                    'ip_address' => $request->ip(),
                    'correlation_id' => $correlationId,
                    'metadata' => ['user_agent' => $request->userAgent()],
                ]);
            } catch (\Throwable) {
                // Audit persistence must never replace the original API response.
            }
            if ($response->getStatusCode() >= 400 && $request->user() && str_contains($request->path(), 'data-exchange/import/')) {
                try { app(NotificationService::class)->notifyImportFailure($request->user()->organization_id, (string) $request->route('resource'), 'The import request failed with HTTP '.$response->getStatusCode(), ['status_code' => $response->getStatusCode(), 'path' => $request->path()]); } catch (\Throwable) { /* Notification failure must not alter the original response. */ }
            }
        }
        return $response;
    }
}
