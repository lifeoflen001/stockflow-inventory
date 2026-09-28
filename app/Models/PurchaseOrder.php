<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['expected_date' => 'date', 'subtotal' => 'float', 'tax_amount' => 'float', 'total_amount' => 'float', 'paid_amount' => 'float'];
    }

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function createdBy(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function items(): HasMany { return $this->hasMany(PurchaseOrderItem::class); }
    public function payments(): HasMany { return $this->hasMany(PurchaseOrderPayment::class); }
    public function documents(): HasMany { return $this->hasMany(PurchaseOrderDocument::class); }
    public function comments(): HasMany { return $this->hasMany(PurchaseOrderComment::class); }
}
