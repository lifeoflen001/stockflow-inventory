<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierDocument extends Model { protected $guarded = []; protected function casts(): array { return ['size' => 'integer', 'expires_at' => 'date']; } public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); } public function uploadedBy(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); } }
