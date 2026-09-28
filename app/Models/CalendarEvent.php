<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class CalendarEvent extends Model { protected $guarded = []; protected function casts(): array { return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'all_day' => 'boolean']; } }
