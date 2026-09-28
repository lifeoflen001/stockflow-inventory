<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class SystemBackup extends Model { protected $guarded=[]; protected function casts():array{return ['includes_uploads'=>'boolean','size'=>'integer'];} }
