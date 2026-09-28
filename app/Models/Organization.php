<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['is_active' => 'boolean', 'settings' => 'array']; }
    public function branches(): HasMany { return $this->hasMany(Branch::class); }
    public function users(): HasMany { return $this->hasMany(User::class); }
    public function policies(): HasMany { return $this->hasMany(Policy::class); }
}
