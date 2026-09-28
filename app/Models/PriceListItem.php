<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo; class PriceListItem extends Model {protected $guarded=[];protected function casts():array{return ['unit_price'=>'decimal:2','vat_rate'=>'float'];}public function priceList():BelongsTo{return $this->belongsTo(PriceList::class);}}
