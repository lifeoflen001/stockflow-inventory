<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class EmailVerificationCode extends Model { protected $guarded = []; protected function casts(): array { return ['expires_at' => 'datetime', 'last_sent_at' => 'datetime']; } }
