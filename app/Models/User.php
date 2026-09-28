<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Permission checks are often performed by route middleware and then
     * repeated by the controller in the same request. Keep these values on
     * the model instance for the lifetime of the request so one API call does
     * not re-query the role graph for every check.
     */
    private ?string $resolvedPrimaryRole = null;
    private ?Collection $resolvedPermissionNames = null;

    public function refresh(): static
    {
        $this->resolvedPermissionNames = null;
        $this->resolvedPrimaryRole = null;

        return parent::refresh();
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'organization_id',
        'department_id',
        'supplier_id',
        'email',
        'phone',
        'avatar_path',
        'signature_path',
        'password',
        'is_active',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withPivot('organization_id');
    }

    public function organizationRoles(): BelongsToMany
    {
        return $this->roles()->wherePivot('organization_id', $this->organization_id);
    }

    public function permissionOverrides(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_user')
            ->withPivot(['organization_id', 'allowed'])
            ->withTimestamps();
    }

    public function apiTokens(): HasMany { return $this->hasMany(ApiToken::class); }

    public function hasPermission(string $permission): bool
    {
        if ($this->primaryRole() === 'super_admin') return true;
        return $this->effectivePermissionNames()->contains($permission);
    }

    public function effectivePermissionNames(): Collection
    {
        if ($this->resolvedPermissionNames !== null) return $this->resolvedPermissionNames;
        if ($this->primaryRole() === 'super_admin') return $this->resolvedPermissionNames = Permission::pluck('name')->values();

        $base = $this->relationLoaded('roles')
            ? $this->roles->filter(fn (Role $role) => (int) ($role->pivot?->organization_id ?? 0) === (int) $this->organization_id)->flatMap(fn (Role $role) => $role->relationLoaded('permissions') ? $role->permissions->pluck('name') : $role->permissions()->pluck('name'))
            : $this->organizationRoles()->with('permissions')->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
            ->unique()
            ->values();
        $overrides = $this->relationLoaded('permissionOverrides')
            ? $this->permissionOverrides->filter(fn (Permission $permission) => (int) ($permission->pivot?->organization_id ?? 0) === (int) $this->organization_id)
            : $this->permissionOverrides()
            ->wherePivot('organization_id', $this->organization_id)
            ->get();
        $overrideNames = $overrides->pluck('name');

        return $this->resolvedPermissionNames = $base->reject(fn (string $name) => $overrideNames->contains($name))
            ->merge($overrides->filter(fn (Permission $permission) => (bool) $permission->pivot->allowed)->pluck('name'))
            ->unique()
            ->values();
    }

    public function primaryRole(): ?string
    {
        if ($this->resolvedPrimaryRole !== null) return $this->resolvedPrimaryRole;
        if ($this->relationLoaded('roles')) {
            return $this->resolvedPrimaryRole = $this->roles
                ->filter(fn (Role $role) => (int) ($role->pivot?->organization_id ?? 0) === (int) $this->organization_id)
                ->sortBy('id')->first()?->name;
        }
        return $this->resolvedPrimaryRole = $this->organizationRoles()->orderBy('roles.id')->value('name');
    }
}
