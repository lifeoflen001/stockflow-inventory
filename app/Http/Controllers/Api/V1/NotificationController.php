<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{AppNotification, NotificationRule, UserNotificationPreference};
use App\Services\NotificationService;
use App\Support\ApiResponse;
use Illuminate\Http\{JsonResponse, Request};
use Symfony\Component\HttpFoundation\StreamedResponse;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->integer('limit', 30), 1), 100);
        $query = $this->forUser($request)->latest('id');
        if ($request->filled('kind') && in_array($request->string('kind')->toString(), ['message', 'alert'], true)) $query->where('kind', $request->string('kind'));

        return ApiResponse::success($query->limit($limit)->get()->map(fn (AppNotification $notification) => $this->payload($notification))->values(), 200, [
            'unread_count' => $this->forUser($request)->whereNull('read_at')->count(),
        ]);
    }

    public function markRead(Request $request, AppNotification $notification): JsonResponse
    {
        $this->owned($request, $notification);
        $notification->update(['read_at' => $notification->read_at ?? now()]);
        return ApiResponse::success($this->payload($notification->fresh()));
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $updated = $this->forUser($request)->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);
        return ApiResponse::success(['updated' => $updated]);
    }

    public function preferences(Request $request, NotificationService $notifications): JsonResponse
    {
        $user = $request->user();
        $saved = UserNotificationPreference::query()->where('organization_id', $user->organization_id)->where('user_id', $user->id)->get()->keyBy(fn (UserNotificationPreference $preference) => $preference->event_type.':'.$preference->channel);
        $items = collect(NotificationService::EVENTS)->map(function (string $eventType) use ($saved, $notifications) {
            $rule = NotificationRule::query()->where('organization_id', request()->user()->organization_id)->where('event_type', $eventType)->first();
            $default = $notifications->defaults($eventType);
            return ['eventType' => $eventType, 'severity' => $rule?->severity ?: $default['severity'], 'mandatory' => (bool) ($rule?->mandatory ?? $default['mandatory']), 'channels' => collect(['in_app', 'email'])->map(fn (string $channel) => ['channel' => $channel, 'enabled' => (bool) ($saved->get($eventType.':'.$channel)?->enabled ?? true)])->values()];
        });
        return ApiResponse::success($items->values());
    }

    public function updatePreference(Request $request, string $eventType): JsonResponse
    {
        abort_unless(in_array($eventType, NotificationService::EVENTS, true), 404);
        $data = $request->validate(['channel' => ['required', 'in:email,in_app'], 'enabled' => ['required', 'boolean']]);
        $user = $request->user();
        $rule = NotificationRule::query()->where('organization_id', $user->organization_id)->where('event_type', $eventType)->first();
        if ($data['enabled'] === false && $rule?->mandatory && $rule->severity === 'critical') {
            return ApiResponse::error('This critical notification is enforced by the administrator.', 422);
        }
        $preference = UserNotificationPreference::query()->updateOrCreate(['organization_id' => $user->organization_id, 'user_id' => $user->id, 'event_type' => $eventType, 'channel' => $data['channel']], ['enabled' => $data['enabled']]);
        return ApiResponse::success(['eventType' => $eventType, 'channel' => $preference->channel, 'enabled' => (bool) $preference->enabled]);
    }

    public function rules(Request $request, NotificationService $notifications): JsonResponse
    {
        $organizationId = $request->user()->organization_id;
        $saved = NotificationRule::query()->where('organization_id', $organizationId)->get()->keyBy('event_type');
        return ApiResponse::success(collect(NotificationService::EVENTS)->map(function (string $eventType) use ($saved, $notifications) {
            $rule = $saved->get($eventType);
            $default = $notifications->defaults($eventType);
            return ['eventType' => $eventType, 'enabled' => (bool) ($rule?->enabled ?? true), 'severity' => $rule?->severity ?: $default['severity'], 'recipients' => $rule?->recipients ?: $default['recipients'], 'channels' => $rule?->channels ?: array_merge(['in_app'], $default['channels']), 'mandatory' => (bool) ($rule?->mandatory ?? $default['mandatory']), 'rateLimitPerHour' => $rule?->rate_limit_per_hour];
        })->values());
    }

    public function updateRule(Request $request, string $eventType): JsonResponse
    {
        abort_unless(in_array($eventType, NotificationService::EVENTS, true), 404);
        $data = $request->validate(['enabled' => ['required', 'boolean'], 'severity' => ['required', 'in:info,warning,critical'], 'recipients' => ['nullable', 'array'], 'channels' => ['required', 'array'], 'channels.*' => ['in:in_app,email'], 'mandatory' => ['required', 'boolean'], 'rateLimitPerHour' => ['nullable', 'integer', 'min:1', 'max:100000']]);
        $rule = NotificationRule::query()->updateOrCreate(['organization_id' => $request->user()->organization_id, 'event_type' => $eventType], ['enabled' => $data['enabled'], 'severity' => $data['severity'], 'recipients' => $data['recipients'] ?? [], 'channels' => array_values(array_unique(array_merge(['in_app'], $data['channels']))), 'mandatory' => $data['mandatory'], 'rate_limit_per_hour' => $data['rateLimitPerHour'] ?? null]);
        return ApiResponse::success(['eventType' => $rule->event_type, 'enabled' => (bool) $rule->enabled]);
    }

    public function broadcast(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string', 'max:2000'],
            'kind' => ['required', 'in:message,alert'],
            'action_url' => ['nullable', 'string', 'max:500'],
        ]);
        $sent = $notifications->broadcast($request->user()->organization_id, $data + ['icon' => $data['kind'] === 'alert' ? 'alert' : 'message']);
        return ApiResponse::success(['sent' => $sent]);
    }

    public function stream(Request $request): StreamedResponse
    {
        $user = $request->user();
        $after = (int) $request->integer('after', 0);

        return response()->stream(function () use ($user, $after): void {
            ignore_user_abort(true);
            set_time_limit(35);
            $lastId = $after;
            $started = microtime(true);

            while (microtime(true) - $started < 25) {
                $items = AppNotification::query()
                    ->where('organization_id', $user->organization_id)
                    ->where('user_id', $user->id)
                    ->where('id', '>', $lastId)
                    ->oldest('id')->limit(25)->get();

                foreach ($items as $item) {
                    echo "event: notification\n";
                    echo 'data: '.json_encode($this->payload($item), JSON_THROW_ON_ERROR)."\n\n";
                    $lastId = max($lastId, (int) $item->id);
                }

                echo ": heartbeat\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
                if ($items->isNotEmpty()) break;
                usleep(500000);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function forUser(Request $request)
    {
        return AppNotification::query()->where('organization_id', $request->user()->organization_id)->where('user_id', $request->user()->id);
    }

    private function owned(Request $request, AppNotification $notification): void
    {
        abort_unless((int) $notification->organization_id === (int) $request->user()->organization_id && (int) $notification->user_id === (int) $request->user()->id, 404);
    }

    private function payload(AppNotification $notification): array
    {
        return [
            'id' => (string) $notification->id,
            'kind' => $notification->kind,
            'eventType' => $notification->event_type,
            'severity' => $notification->severity ?: ($notification->kind === 'alert' ? 'warning' : 'info'),
            'title' => $notification->title,
            'message' => $notification->message,
            'actionUrl' => $notification->action_url,
            'icon' => $notification->icon,
            'metadata' => $notification->metadata ?? [],
            'relatedType' => $notification->related_type,
            'relatedId' => $notification->related_id ? (string) $notification->related_id : null,
            'deliveryStatus' => $notification->delivery_status,
            'readAt' => $notification->read_at?->toIso8601String(),
            'createdAt' => $notification->created_at?->toIso8601String(),
        ];
    }
}
