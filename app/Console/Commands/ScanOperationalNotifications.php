<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class ScanOperationalNotifications extends Command
{
    protected $signature = 'notifications:scan-operational';
    protected $description = 'Generate deduplicated notifications for expiry and pending-delivery conditions';

    public function handle(NotificationService $notifications): int
    {
        $expired = $pending = 0;
        Organization::query()->where('is_active', true)->each(function (Organization $organization) use ($notifications, &$expired, &$pending) {
            $expired += $notifications->scanExpiringProducts($organization);
            $pending += $notifications->scanPendingDeliveries($organization);
        });
        $this->info("Generated {$expired} expiry and {$pending} delivery notifications.");
        return self::SUCCESS;
    }
}
