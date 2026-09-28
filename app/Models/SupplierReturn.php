<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierReturn extends Model { protected $guarded = []; protected function casts(): array { return ['amount' => 'float', 'returned_at' => 'date']; } public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); } public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); } }
