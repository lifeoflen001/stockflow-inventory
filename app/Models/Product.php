<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['tags' => 'array', 'is_active' => 'boolean', 'cost_price' => 'decimal:2', 'selling_price' => 'decimal:2', 'tax_rate' => 'float', 'reorder_level' => 'float', 'expires_at' => 'date'];
    }

    public function category(): BelongsTo { return $this->belongsTo(Category::class); }
    public function unit(): BelongsTo { return $this->belongsTo(Unit::class); }
    public function stockBalances(): HasMany { return $this->hasMany(StockBalance::class); }
}
