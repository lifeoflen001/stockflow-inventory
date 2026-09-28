<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\HasMany; class PriceList extends Model {protected $guarded=[];protected function casts():array{return ['is_active'=>'boolean','effective_from'=>'date','effective_to'=>'date'];}public function items():HasMany{return $this->hasMany(PriceListItem::class);}}
