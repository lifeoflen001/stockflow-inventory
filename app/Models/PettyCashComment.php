<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PettyCashComment extends Model
{
    protected $guarded = [];

    public function pettyCashVoucher(): BelongsTo { return $this->belongsTo(PettyCashVoucher::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
