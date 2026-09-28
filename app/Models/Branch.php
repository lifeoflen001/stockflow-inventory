<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['is_active' => 'boolean']; }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function stores(): HasMany { return $this->hasMany(Store::class); }
    public function warehouses(): HasMany { return $this->hasMany(Warehouse::class); }
    public function departments(): HasMany { return $this->hasMany(Department::class); }
}
