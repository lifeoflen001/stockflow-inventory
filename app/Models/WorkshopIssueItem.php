<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkshopIssueItem extends Model
{
    protected $guarded = [];
    protected function casts(): array { return ['quantity_before' => 'float', 'quantity_out' => 'float', 'quantity_after' => 'float']; }
    public function batch(): BelongsTo { return $this->belongsTo(WorkshopIssueBatch::class, 'workshop_issue_batch_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
