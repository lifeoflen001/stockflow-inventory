<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, BelongsToMany};
class Announcement extends Model {
    protected $guarded = [];
    protected function casts(): array { return ['starts_at'=>'date','ends_at'=>'date','is_featured'=>'boolean','company_wide'=>'boolean']; }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function branches(): BelongsToMany { return $this->belongsToMany(Branch::class); }
    public function departments(): BelongsToMany { return $this->belongsToMany(Department::class); }
    public function recipients(): BelongsToMany { return $this->belongsToMany(User::class, 'announcement_user'); }
    public function viewers(): BelongsToMany { return $this->belongsToMany(User::class, 'announcement_views')->withPivot('viewed_at'); }
}
