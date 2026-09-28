<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class Customer extends Model {protected $guarded=[];protected function casts():array{return ['is_active'=>'boolean','credit_limit'=>'float','discount_rate'=>'float'];}}
