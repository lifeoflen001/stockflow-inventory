<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
class MediaFolder extends Model { protected $guarded = []; public function assets(): HasMany { return $this->hasMany(MediaAsset::class, 'folder_id'); } }
