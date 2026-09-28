<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApiToken extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['expires_at' => 'datetime', 'last_used_at' => 'datetime']; }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
