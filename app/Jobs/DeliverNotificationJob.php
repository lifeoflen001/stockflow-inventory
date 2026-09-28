<?php

namespace App\Jobs;

use App\Mail\OperationalNotificationMail;
use App\Models\{AppNotification, NotificationDelivery, Organization};
use App\Services\MailDeliveryService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class DeliverNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;
    public array $backoff = [60, 300, 900, 1800];

    public function __construct(public int $notificationId, public int $deliveryId) {}

    public function handle(MailDeliveryService $mailer): void
    {
        $delivery = NotificationDelivery::query()->with(['notification.user', 'notification.organization'])->find($this->deliveryId);
        if (! $delivery || $delivery->status === 'sent') return;
        $notification = $delivery->notification;
        if (! $notification || ! $notification->user || ! $notification->organization || ! filled($notification->user->email)) return;

        try {
            $delivery->update(['status' => 'sending', 'attempts' => $delivery->attempts + 1]);
            $mailer->send($notification->organization, $notification->user->email, $notification->user->name, new OperationalNotificationMail($notification));
            $delivery->update(['status' => 'sent', 'delivered_at' => now(), 'last_error' => null]);
            $notification->update(['delivery_status' => 'delivered', 'delivery_attempts' => $delivery->attempts, 'delivered_at' => now(), 'failure_reason' => null]);
        } catch (Throwable $exception) {
            $delivery->update(['status' => $this->attempts() >= $this->tries ? 'dead' : 'failed', 'last_error' => $exception->getMessage()]);
            $notification->update(['delivery_status' => $this->attempts() >= $this->tries ? 'dead' : 'failed', 'delivery_attempts' => $delivery->attempts, 'failure_reason' => $exception->getMessage()]);
            throw $exception;
        }
    }

    public function failed(Throwable $exception): void
    {
        NotificationDelivery::query()->whereKey($this->deliveryId)->update(['status' => 'dead', 'last_error' => $exception->getMessage()]);
        AppNotification::query()->whereKey($this->notificationId)->update(['delivery_status' => 'dead', 'failure_reason' => $exception->getMessage()]);
    }
}
