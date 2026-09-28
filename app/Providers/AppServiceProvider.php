<?php

namespace App\Providers;

use App\Services\NotificationService;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Queue::failing(function (JobFailed $event): void {
            $jobName = $event->job->resolveName();
            if (str_contains($jobName, 'DeliverNotificationJob')) return;
            $serialized = (string) data_get($event->job->payload(), 'data.command', '');
            if (! preg_match('/organization(?:Id|_id)[^0-9]{0,20}(\d+)/i', $serialized, $matches)) return;
            app(NotificationService::class)->notifyBackgroundJobFailure((int) $matches[1], $jobName, $event->exception->getMessage(), ['job' => $jobName]);
        });
    }
}
