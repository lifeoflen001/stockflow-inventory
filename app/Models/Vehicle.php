<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['is_active' => 'boolean', 'capacity' => 'integer', 'last_service' => 'date', 'next_service' => 'date']; }
}
