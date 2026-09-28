<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierContact extends Model { protected $guarded = []; protected function casts(): array { return ['is_primary' => 'boolean', 'is_active' => 'boolean']; } public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); } }
