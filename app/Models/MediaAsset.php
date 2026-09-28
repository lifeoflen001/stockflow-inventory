<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class MediaAsset extends Model { protected $guarded = []; protected function casts(): array { return ['size' => 'integer']; } }
