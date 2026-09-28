<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PettyCashDocument extends Model
{
    protected $guarded = [];

    protected function casts(): array { return ['size' => 'integer']; }

    public function pettyCashVoucher(): BelongsTo { return $this->belongsTo(PettyCashVoucher::class); }
    public function uploadedBy(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
