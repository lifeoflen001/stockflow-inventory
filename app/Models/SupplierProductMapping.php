<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierProductMapping extends Model { protected $guarded = []; protected function casts(): array { return ['unit_conversion' => 'float', 'unit_price' => 'float']; } public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); } public function product(): BelongsTo { return $this->belongsTo(Product::class); } }
