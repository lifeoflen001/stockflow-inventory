<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Notifications\DatabaseNotification;

class AppNotification extends DatabaseNotification
{
    protected $table = 'app_notifications';
    protected $guarded = [];
    public $incrementing = true;
    protected $keyType = 'int';

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'read_at' => 'datetime',
            'delivered_at' => 'datetime',
            'delivery_attempts' => 'integer',
        ];
    }

    public function deliveries(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(NotificationDelivery::class, 'app_notification_id');
    }

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
