<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Supplier extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['is_active' => 'boolean', 'rating' => 'float']; }
    public function users(): HasMany { return $this->hasMany(User::class); }
    public function purchaseOrders(): HasMany { return $this->hasMany(PurchaseOrder::class); }
    public function contacts(): HasMany { return $this->hasMany(SupplierContact::class); }
    public function commercialTerms(): HasOne { return $this->hasOne(SupplierCommercialTerm::class); }
    public function productMappings(): HasMany { return $this->hasMany(SupplierProductMapping::class); }
    public function documents(): HasMany { return $this->hasMany(SupplierDocument::class); }
    public function returns(): HasMany { return $this->hasMany(SupplierReturn::class); }
}
