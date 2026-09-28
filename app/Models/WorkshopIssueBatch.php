<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkshopIssueBatch extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['issued_at' => 'datetime']; }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function vehicle(): BelongsTo { return $this->belongsTo(Vehicle::class); }
    public function collector(): BelongsTo { return $this->belongsTo(WorkshopStaff::class, 'collector_staff_id'); }
    public function issuer(): BelongsTo { return $this->belongsTo(User::class, 'issued_by'); }
    public function items(): HasMany { return $this->hasMany(WorkshopIssueItem::class); }
}
