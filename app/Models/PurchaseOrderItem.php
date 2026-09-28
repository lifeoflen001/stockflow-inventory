<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['ordered_qty' => 'float', 'received_qty' => 'float', 'unit_cost' => 'float', 'tax_rate' => 'float', 'tax_amount' => 'float', 'total' => 'float'];
    }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
