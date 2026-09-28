<?php

namespace App\Services;

use App\Jobs\DeliverNotificationJob;
use App\Mail\PurchaseOrderCreatedMail;
use App\Models\{AppNotification, Department, NotificationDelivery, NotificationRule, Organization, Product, PurchaseOrder, PurchaseOrderComment, ReplenishmentRequest, User, UserNotificationPreference, Warehouse};
use Illuminate\Support\Collection;
use Illuminate\Database\QueryException;
use Throwable;

/** Central notification domain service used by all operational workflows. */
class NotificationService
{
    public const EVENTS = [
        'low_stock', 'critical_stock', 'product_expiring', 'product_expired',
        'purchase_order.pending_approval', 'purchase_order.pending_delivery',
        'purchase_order.comment', 'purchase_order.created_for_supplier',
        'unusual_stock_adjustment', 'import.failed', 'synchronization.failed',
        'negative_inventory_attempt', 'background_job.failed', 'announcement.published',
        'departmental_order.created', 'broadcast',
    ];

    public function emit(Organization|int $organization, string $eventType, array $payload, ?string $dedupeKey = null, Collection|array|null $recipients = null): int
    {
        $organizationId = $organization instanceof Organization ? $organization->id : (int) $organization;
        $rule = NotificationRule::query()->where('organization_id', $organizationId)->where('event_type', $eventType)->first();
        $defaults = $this->defaults($eventType);
        if ($rule && ! $rule->enabled) return 0;
        $organizationSettings = $organization instanceof Organization ? (array) $organization->settings : (array) Organization::query()->find($organizationId)?->settings;
        if ($eventType === 'low_stock' && data_get($organizationSettings, 'low_stock_notifications') === false) return 0;
        if ($rule?->rate_limit_per_hour && AppNotification::query()->where('organization_id', $organizationId)->where('event_type', $eventType)->where('created_at', '>=', now()->subHour())->count() >= $rule->rate_limit_per_hour) return 0;

        $severity = (string) ($rule?->severity ?: ($payload['severity'] ?? $defaults['severity']));
        $mandatory = (bool) ($rule?->mandatory ?? $defaults['mandatory']);
        $channels = array_values(array_unique(array_merge(['in_app'], (array) ($rule?->channels ?: ($payload['channels'] ?? $defaults['channels'])))));
        $users = $this->resolveRecipients($organizationId, $rule, $defaults, $recipients, $payload['exclude_user_ids'] ?? []);
        if ($users->isEmpty()) return 0;

        $created = 0;
        foreach ($users as $user) {
            if ($dedupeKey && AppNotification::query()->where('organization_id', $organizationId)->where('user_id', $user->id)->where('dedupe_key', $dedupeKey)->exists()) continue;

            try {
                $notification = AppNotification::query()->create([
                'organization_id' => $organizationId, 'user_id' => $user->id,
                'kind' => $payload['kind'] ?? ($severity === 'info' ? 'message' : 'alert'),
                'event_type' => $eventType, 'severity' => $severity,
                'title' => $payload['title'], 'message' => $payload['message'],
                'action_url' => $payload['action_url'] ?? null, 'icon' => $payload['icon'] ?? null,
                'related_type' => $payload['related_type'] ?? null, 'related_id' => $payload['related_id'] ?? null,
                'dedupe_key' => $dedupeKey, 'delivery_status' => 'delivered', 'delivery_attempts' => 0,
                'delivered_at' => now(), 'metadata' => array_merge((array) ($payload['metadata'] ?? []), ['mandatory' => $mandatory]),
                ]);
            } catch (QueryException $exception) {
                if ($dedupeKey) continue;
                throw $exception;
            }
            $created++;
            NotificationDelivery::query()->create(['app_notification_id' => $notification->id, 'channel' => 'in_app', 'status' => 'sent', 'attempts' => 1, 'delivered_at' => now()]);

            if (in_array('email', $channels, true) && filled($user->email) && $this->emailAllowed($organizationId, $user, $eventType, $severity, $mandatory)) {
                $delivery = NotificationDelivery::query()->create(['app_notification_id' => $notification->id, 'channel' => 'email', 'status' => 'pending']);
                $notification->update(['delivery_status' => 'pending']);
                DeliverNotificationJob::dispatch($notification->id, $delivery->id)->afterCommit();
            }
        }
        return $created;
    }

    public function broadcast(Organization|int $organization, array $payload, ?Collection $recipients = null): int
    {
        return $this->emit($organization, 'broadcast', $payload, null, $recipients);
    }

    public function notifyAnnouncement(\App\Models\Announcement $announcement): int
    {
        $announcement->loadMissing('organization', 'recipients');
        $recipients = $announcement->company_wide ? null : User::query()->whereIn('id', $announcement->recipients->pluck('id'))->where('is_active', true)->get(['id', 'email', 'name']);
        return $this->emit($announcement->organization_id, 'announcement.published', ['kind' => $announcement->priority === 'high' ? 'alert' : 'message', 'title' => $announcement->title, 'message' => $announcement->summary ?: str($announcement->content)->limit(140)->toString(), 'action_url' => '/announcements/'.$announcement->id, 'icon' => $announcement->priority === 'high' ? 'alert' : 'megaphone', 'related_type' => 'announcement', 'related_id' => $announcement->id, 'metadata' => ['announcement_id' => $announcement->id]], 'announcement:'.$announcement->id, $recipients);
    }

    public function notifyPurchaseOrderComment(PurchaseOrder $purchaseOrder, PurchaseOrderComment $comment): int
    {
        $comment->loadMissing('user:id,name');
        $recipients = User::query()->where('organization_id', $purchaseOrder->organization_id)->where('is_active', true)->where('id', '<>', $comment->user_id)->whereHas('roles', fn ($query) => $query->where('role_user.organization_id', $purchaseOrder->organization_id)->whereHas('permissions', fn ($permissionQuery) => $permissionQuery->where('permissions.name', 'purchase_orders.view')))->get(['id', 'email', 'name']);
        return $this->emit($purchaseOrder->organization_id, 'purchase_order.comment', ['title' => 'New purchase order comment', 'message' => ($comment->user?->name ?? 'A user').' commented on '.$purchaseOrder->po_number.': '.str($comment->body)->limit(140)->toString(), 'action_url' => '/procurement/'.$purchaseOrder->id, 'icon' => 'message', 'related_type' => 'purchase_order', 'related_id' => $purchaseOrder->id, 'metadata' => ['purchase_order_id' => (string) $purchaseOrder->id, 'purchase_order_number' => $purchaseOrder->po_number, 'comment_id' => (string) $comment->id]], 'purchase_order:'.$purchaseOrder->id.':comment:'.$comment->id, $recipients);
    }

    public function notifyPurchaseOrderPendingApproval(PurchaseOrder $purchaseOrder): int
    {
        $recipients = User::query()->where('organization_id', $purchaseOrder->organization_id)->where('is_active', true)->where('id', '<>', $purchaseOrder->created_by)->get(['id', 'organization_id', 'email', 'name'])->filter(fn (User $user) => $user->hasPermission('purchase_orders.approve'))->values();
        return $this->emit($purchaseOrder->organization_id, 'purchase_order.pending_approval', ['kind' => 'alert', 'severity' => 'warning', 'title' => 'Purchase order approval required', 'message' => $purchaseOrder->po_number.' is waiting for procurement manager approval.', 'action_url' => '/procurement/'.$purchaseOrder->id, 'icon' => 'clipboard-check', 'related_type' => 'purchase_order', 'related_id' => $purchaseOrder->id, 'metadata' => ['purchase_order_id' => (string) $purchaseOrder->id, 'purchase_order_number' => $purchaseOrder->po_number, 'status' => 'pending_approval']], 'purchase_order:'.$purchaseOrder->id.':pending_approval', $recipients);
    }

    public function notifyPurchaseOrderCreatedForSupplier(PurchaseOrder $purchaseOrder, ?MailDeliveryService $legacyDelivery = null): int
    {
        $recipients = User::query()->where('organization_id', $purchaseOrder->organization_id)->where('supplier_id', $purchaseOrder->supplier_id)->where('is_active', true)->get(['id', 'email', 'name']);
        $count = $this->emit($purchaseOrder->organization_id, 'purchase_order.created_for_supplier', ['title' => 'New purchase order for your company', 'message' => $purchaseOrder->po_number.' was created and is awaiting approval.', 'action_url' => '/supplier-portal', 'icon' => 'clipboard', 'related_type' => 'purchase_order', 'related_id' => $purchaseOrder->id, 'metadata' => ['purchase_order_id' => (string) $purchaseOrder->id, 'purchase_order_number' => $purchaseOrder->po_number, 'status' => $purchaseOrder->status]], 'purchase_order:'.$purchaseOrder->id.':supplier', $recipients);
        if ($legacyDelivery) {
            $organization = Organization::find($purchaseOrder->organization_id);
            if ($organization) foreach ($recipients as $recipient) if (filled($recipient->email)) {
                try { $legacyDelivery->send($organization, $recipient->email, $recipient->name, new PurchaseOrderCreatedMail($purchaseOrder, rtrim((string) config('app.frontend_url', 'http://localhost:5173'), '/').'/supplier-portal')); } catch (Throwable $exception) { report($exception); }
            }
        }
        return $count;
    }

    public function notifyPendingPurchaseOrderApprovals(Organization|int $organization): int
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;
        $created = 0;
        PurchaseOrder::query()
            ->where('organization_id', $organizationId)
            ->where('status', 'draft')
            ->select(['id', 'organization_id', 'created_by', 'po_number'])
            ->lazyById(100)
            ->each(function (PurchaseOrder $order) use (&$created): void {
                $created += $this->notifyPurchaseOrderPendingApproval($order);
            });

        return $created;
    }

    public function notifyDepartmentalOrder(ReplenishmentRequest $order, Department $department): int
    {
        $recipients = User::query()->where('organization_id', $order->organization_id)->where('is_active', true)->where('id', '<>', $order->requested_by)->get(['id', 'organization_id', 'email', 'name'])->filter(fn (User $user) => $user->hasPermission('requisitions.view') || $user->hasPermission('purchase_orders.create') || $user->hasPermission('purchase_orders.approve'))->values();
        return $this->emit($order->organization_id, 'departmental_order.created', ['title' => 'New departmental order', 'message' => $department->name.' submitted '.$order->reference.' for '.($order->product?->name ?? 'a stock item').'.', 'action_url' => '/department-workspace', 'icon' => 'clipboard', 'related_type' => 'replenishment_request', 'related_id' => $order->id, 'metadata' => ['department_id' => (string) $department->id, 'order_id' => (string) $order->id, 'reference' => $order->reference]], 'departmental_order:'.$order->id, $recipients);
    }

    public function notifyStockLevel(Product $product, Warehouse $warehouse, float $quantity): int
    {
        $threshold = (float) ($product->reorder_level ?? 0);
        if ($quantity > $threshold) return 0;
        $critical = $quantity <= 0;
        return $this->emit($product->organization_id, $critical ? 'critical_stock' : 'low_stock', ['severity' => $critical ? 'critical' : 'warning', 'title' => $critical ? 'Critical stock level' : 'Low stock level', 'message' => $product->name.' at '.$warehouse->name.' has '.number_format($quantity, 2).' units remaining.', 'action_url' => '/inventory', 'icon' => 'package', 'related_type' => 'product', 'related_id' => $product->id, 'metadata' => ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => $quantity, 'reorder_level' => $threshold]], 'stock:'.$product->id.':'.$warehouse->id.':'.($critical ? 'critical' : 'low'));
    }

    public function notifyUnusualStockAdjustment(Product $product, Warehouse $warehouse, float $quantity, string $reason, int $userId): int
    {
        $threshold = max(100, ((float) $product->reorder_level) * 10);
        if ($quantity < $threshold) return 0;
        return $this->emit($product->organization_id, 'unusual_stock_adjustment', ['severity' => 'warning', 'title' => 'Unusual stock adjustment', 'message' => number_format($quantity, 2).' units of '.$product->name.' were adjusted at '.$warehouse->name.'.', 'action_url' => '/inventory', 'icon' => 'triangle-alert', 'related_type' => 'stock_movement', 'metadata' => ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => $quantity, 'reason' => $reason, 'user_id' => $userId]], 'stock_adjustment:'.$product->id.':'.$warehouse->id.':'.now()->format('Y-m-d-H'));
    }

    public function notifyNegativeInventoryAttempt(Product $product, Warehouse $warehouse, float $quantity, int $userId): int
    {
        return $this->emit($product->organization_id, 'negative_inventory_attempt', ['severity' => 'critical', 'title' => 'Negative inventory attempt blocked', 'message' => 'An attempt to remove '.number_format($quantity, 2).' units of '.$product->name.' from '.$warehouse->name.' was blocked.', 'action_url' => '/inventory', 'icon' => 'shield-alert', 'related_type' => 'product', 'related_id' => $product->id, 'metadata' => ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => $quantity, 'user_id' => $userId]], 'negative_inventory:'.$product->id.':'.$warehouse->id.':'.now()->format('Y-m-d-H'));
    }

    public function notifyImportFailure(Organization|int $organization, string $resource, string $message, array $metadata = []): int
    {
        return $this->emit($organization, 'import.failed', ['severity' => 'warning', 'title' => 'Data import failed', 'message' => $resource.': '.$message, 'action_url' => '/settings/data-exchange', 'icon' => 'upload-cloud', 'metadata' => $metadata], 'import_failed:'.$resource.':'.now()->format('Y-m-d-H-i'));
    }

    public function notifySynchronizationFailure(Organization|int $organization, string $operationType, string $message, array $metadata = []): int
    {
        return $this->emit($organization, 'synchronization.failed', ['severity' => 'warning', 'title' => 'Offline synchronization failed', 'message' => $operationType.': '.$message, 'action_url' => '/offline-sync', 'icon' => 'refresh-cw-off', 'metadata' => $metadata], 'synchronization_failed:'.sha1($operationType.'|'.$message.'|'.now()->format('Y-m-d-H')));
    }

    public function notifyBackgroundJobFailure(Organization|int $organization, string $job, string $message, array $metadata = []): int
    {
        return $this->emit($organization, 'background_job.failed', ['severity' => 'critical', 'title' => 'Background job failed', 'message' => $job.': '.$message, 'action_url' => '/settings/system', 'icon' => 'server-crash', 'metadata' => $metadata], 'background_job_failed:'.sha1($job.'|'.$message.'|'.now()->format('Y-m-d-H')));
    }

    public function scanExpiringProducts(Organization|int $organization): int
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;
        return Product::query()->where('organization_id', $organizationId)->where('is_active', true)->whereNotNull('expires_at')->whereDate('expires_at', '<=', now()->addDays(30)->toDateString())->get()->sum(function (Product $product) {
            $expired = $product->expires_at?->isPast();
            return $this->emit($product->organization_id, $expired ? 'product_expired' : 'product_expiring', ['severity' => $expired ? 'critical' : 'warning', 'title' => $expired ? 'Product expired' : 'Product expiring soon', 'message' => $product->name.' expires on '.$product->expires_at?->toDateString().'.', 'action_url' => '/inventory', 'icon' => 'calendar-x', 'related_type' => 'product', 'related_id' => $product->id, 'metadata' => ['product_id' => $product->id, 'expires_at' => $product->expires_at?->toDateString()]], 'product_expiry:'.$product->id.':'.($expired ? 'expired' : 'expiring').':'.now()->toDateString());
        });
    }

    public function scanPendingDeliveries(Organization|int $organization): int
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;
        return PurchaseOrder::query()->where('organization_id', $organizationId)->whereIn('status', ['confirmed', 'partial'])->whereNotNull('expected_date')->whereDate('expected_date', '<=', now()->addDays(3)->toDateString())->get()->sum(fn (PurchaseOrder $order) => $this->emit($organizationId, 'purchase_order.pending_delivery', ['severity' => 'warning', 'title' => $order->expected_date?->isPast() ? 'Purchase order delivery overdue' : 'Purchase order delivery pending', 'message' => $order->po_number.' is awaiting delivery from '.$order->supplier?->name.'.', 'action_url' => '/procurement/'.$order->id, 'icon' => 'truck', 'related_type' => 'purchase_order', 'related_id' => $order->id, 'metadata' => ['purchase_order_id' => $order->id, 'expected_date' => $order->expected_date?->toDateString(), 'status' => $order->status]], 'purchase_order:'.$order->id.':pending_delivery:'.$order->expected_date?->toDateString()));
    }

    public function defaults(string $eventType): array
    {
        return match ($eventType) {
            'critical_stock', 'product_expired', 'negative_inventory_attempt', 'background_job.failed' => ['severity' => 'critical', 'mandatory' => true, 'recipients' => ['permissions' => ['users.manage']], 'channels' => ['email']],
            'low_stock', 'product_expiring', 'purchase_order.pending_approval', 'purchase_order.pending_delivery', 'unusual_stock_adjustment', 'import.failed', 'synchronization.failed' => ['severity' => 'warning', 'mandatory' => false, 'recipients' => ['permissions' => ['inventory.view']], 'channels' => ['email']],
            default => ['severity' => 'info', 'mandatory' => false, 'recipients' => [], 'channels' => []],
        };
    }

    private function resolveRecipients(int $organizationId, ?NotificationRule $rule, array $defaults, Collection|array|null $explicit, array $excluded): Collection
    {
        if ($explicit !== null) $users = $explicit instanceof Collection ? $explicit : collect($explicit);
        else {
            $criteria = $rule?->recipients ?: $defaults['recipients'];
            $query = User::query()->where('organization_id', $organizationId)->where('is_active', true);
            if (! empty($criteria['user_ids'])) $query->whereIn('id', $criteria['user_ids']);
            $users = $query->get(['id', 'organization_id', 'email', 'name'])->filter(function (User $user) use ($criteria) {
                $permissions = (array) ($criteria['permissions'] ?? []);
                $roles = (array) ($criteria['roles'] ?? []);
                if ($permissions === [] && $roles === []) return true;
                return collect($permissions)->contains(fn (string $permission) => $user->hasPermission($permission)) || collect($roles)->contains($user->primaryRole());
            })->values();
        }
        return $users->filter(fn ($user) => ! in_array((int) data_get($user, 'id'), array_map('intval', $excluded), true))->unique('id')->values();
    }

    private function emailAllowed(int $organizationId, User $user, string $eventType, string $severity, bool $mandatory): bool
    {
        $settings = (array) Organization::query()->find($organizationId)?->settings;
        if (! $mandatory && data_get($settings, 'email_notifications') === false) return false;
        $preference = UserNotificationPreference::query()->where('organization_id', $organizationId)->where('user_id', $user->id)->where('event_type', $eventType)->where('channel', 'email')->value('enabled');
        return $mandatory || $preference !== false;
    }
}
