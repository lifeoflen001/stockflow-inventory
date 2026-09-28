<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkshopStaff extends Model
{
    protected $table = 'workshop_staff';
    protected $guarded = [];
    protected function casts(): array { return ['is_active' => 'boolean']; }
}
