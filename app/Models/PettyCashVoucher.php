<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PettyCashVoucher extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'issued_at' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function issuedBy(): BelongsTo { return $this->belongsTo(User::class, 'issued_by'); }
    public function documents(): HasMany { return $this->hasMany(PettyCashDocument::class); }
    public function comments(): HasMany { return $this->hasMany(PettyCashComment::class); }
}
