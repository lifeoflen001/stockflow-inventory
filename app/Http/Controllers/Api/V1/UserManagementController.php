<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;

class UserManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        $users = User::query()->where('organization_id', $request->user()->organization_id)
            ->with(['roles:id,name,label', 'roles.permissions:id,name,group', 'permissionOverrides:id,name', 'department:id,name,code', 'supplier:id,name'])->orderBy('name')->get()
            ->map(fn (User $user) => $this->payload($user));
        return ApiResponse::success($users);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        abort_unless($user->organization_id === $request->user()->organization_id, 404);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'role_id' => ['sometimes', 'integer', Rule::exists('roles', 'id')],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('organization_id', $request->user()->organization_id)->where('is_active', true)],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('organization_id', $request->user()->organization_id)->where('is_active', true)],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => ['integer', Rule::exists('permissions', 'id')],
        ]);
        $role = isset($data['role_id']) ? Role::findOrFail($data['role_id']) : $user->organizationRoles()->first();
        if (isset($data['role_id'])) {
            if ($request->user()->is($user) && $role->name !== 'super_admin') {
                abort(422, 'You cannot remove your own super administrator access.');
            }
        }
        $targetIsSuperAdmin = $user->organizationRoles()->where('roles.name', 'super_admin')->exists();
        $demoting = isset($data['role_id']) && $role->name !== 'super_admin';
        $deactivating = array_key_exists('is_active', $data) && ! $data['is_active'];
        if ($request->user()->is($user) && $deactivating) {
            abort(422, 'You cannot deactivate your own account.');
        }
        if ($targetIsSuperAdmin && ($demoting || $deactivating)) {
            $remaining = User::query()->where('organization_id', $user->organization_id)->whereKeyNot($user->id)
                ->where('is_active', true)->whereHas('roles', fn ($query) => $query->where('name', 'super_admin'))->count();
            abort_if($remaining === 0, 422, 'The organization must retain at least one active super administrator.');
        }
        if ($role?->name === 'supplier') abort_unless(array_key_exists('supplier_id', $data) ? ! empty($data['supplier_id']) : ! empty($user->supplier_id), 422, 'Select the supplier company for this user.');
        $user->fill(collect($data)->only(['name', 'is_active', 'department_id', 'supplier_id'])->all())->save();
        if (isset($data['role_id'])) {
            $user->roles()->sync([$data['role_id'] => ['organization_id' => $user->organization_id]]);
            if ($role->name !== 'supplier') $user->update(['supplier_id' => null]);
        }
        if (array_key_exists('permission_ids', $data)) {
            $basePermissionIds = $user->organizationRoles()->with('permissions')->get()
                ->flatMap(fn (Role $role) => $role->permissions->pluck('id'))
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values();
            $desiredPermissionIds = collect($data['permission_ids'])->map(fn ($id) => (int) $id)->unique()->values();
            $overrideRows = $basePermissionIds->merge($desiredPermissionIds)->unique()->filter(function (int $permissionId) use ($basePermissionIds, $desiredPermissionIds) {
                return $basePermissionIds->contains($permissionId) !== $desiredPermissionIds->contains($permissionId);
            })->map(fn (int $permissionId) => [
                'organization_id' => $user->organization_id,
                'user_id' => $user->id,
                'permission_id' => $permissionId,
                'allowed' => $desiredPermissionIds->contains($permissionId),
                'created_at' => now(),
                'updated_at' => now(),
            ])->values()->all();
            DB::table('permission_user')->where('organization_id', $user->organization_id)->where('user_id', $user->id)->delete();
            if ($overrideRows) DB::table('permission_user')->insert($overrideRows);
        }
        return ApiResponse::success($this->payload($user->load(['roles.permissions', 'permissionOverrides'])));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        abort_unless($user->organization_id === $request->user()->organization_id, 404);
        abort_if($user->is($request->user()), 422, 'You cannot delete your own account.');
        $isSuperAdmin = $user->organizationRoles()->where('roles.name', 'super_admin')->exists();
        if ($isSuperAdmin) {
            $remaining = User::query()->where('organization_id', $user->organization_id)->whereKeyNot($user->id)
                ->where('is_active', true)->whereHas('roles', fn ($query) => $query->where('name', 'super_admin'))->count();
            abort_if($remaining === 0, 422, 'The organization must retain at least one active super administrator.');
        }
        DB::transaction(function () use ($user) {
            $user->apiTokens()->delete();
            $user->roles()->detach();
            $user->delete();
        });
        return ApiResponse::success(['deleted' => true]);
    }

    private function payload(User $user): array
    {
        $roles = $user->roles->filter(fn (Role $role) => (int) $role->pivot->organization_id === (int) $user->organization_id)->values();
        $overrides = $user->permissionOverrides;
        return ['id' => (string) $user->id, 'name' => $user->name, 'email' => $user->email, 'avatarUrl' => $user->avatar_path ? '/storage/'.$user->avatar_path : null,
            'isActive' => $user->is_active, 'joinedAt' => $user->created_at?->toDateString(), 'lastLoginAt' => $user->last_login_at?->toIso8601String(), 'lastActiveAt' => $user->last_login_at?->toIso8601String(),
            'roles' => $roles->map(fn (Role $role) => $role->only(['id', 'name', 'label']))->values(),
            'permissions' => $user->effectivePermissionNames(),
            'permissionOverrides' => $overrides->map(fn ($permission) => ['id' => $permission->id, 'name' => $permission->name, 'allowed' => (bool) $permission->pivot->allowed])->values(),
            'department' => $user->department ? ['id' => $user->department->id, 'name' => $user->department->name, 'code' => $user->department->code] : null,
            'supplier' => $user->supplier ? ['id' => $user->supplier->id, 'name' => $user->supplier->name] : null,
            'role' => $roles->first()?->only(['id', 'name', 'label'])];
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->primaryRole() === 'super_admin', 403, 'Only a super administrator can manage users.');
    }
}
