<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasOne};

class PurchaseOrderPayment extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['amount' => 'float']; }
    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function recordedBy(): BelongsTo { return $this->belongsTo(User::class, 'recorded_by'); }
    public function proofOfPayment(): HasOne { return $this->hasOne(PurchaseOrderDocument::class, 'purchase_order_payment_id'); }
}
