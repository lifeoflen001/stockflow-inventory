<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderDocument extends Model
{
    protected $guarded = [];

    protected function casts(): array { return ['size' => 'integer']; }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function purchaseOrderPayment(): BelongsTo { return $this->belongsTo(PurchaseOrderPayment::class); }
    public function uploadedBy(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
