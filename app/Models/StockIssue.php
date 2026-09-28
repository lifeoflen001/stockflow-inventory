<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockIssue extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['quantity' => 'float', 'issued_at' => 'datetime'];
    }

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function issuer(): BelongsTo { return $this->belongsTo(User::class, 'user_id'); }
}
