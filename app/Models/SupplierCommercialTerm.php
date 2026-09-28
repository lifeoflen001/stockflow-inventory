<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierCommercialTerm extends Model { protected $guarded = []; protected function casts(): array { return ['minimum_order_quantity' => 'float', 'pricing_tiers' => 'array', 'volume_discounts' => 'array']; } public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); } }
