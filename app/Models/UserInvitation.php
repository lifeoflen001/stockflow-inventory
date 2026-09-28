<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserInvitation extends Model
{
    protected $guarded = [];
    protected $hidden = ['token_hash'];
    protected function casts(): array { return ['expires_at' => 'datetime', 'accepted_at' => 'datetime', 'revoked_at' => 'datetime']; }
    public function role(): BelongsTo { return $this->belongsTo(Role::class); }
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function inviter(): BelongsTo { return $this->belongsTo(User::class, 'invited_by'); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
}
