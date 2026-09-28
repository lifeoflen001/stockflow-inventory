<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class StockMovement extends Model {protected $guarded=[];protected function casts():array{return ['quantity'=>'float','balance_after'=>'float'];}}
