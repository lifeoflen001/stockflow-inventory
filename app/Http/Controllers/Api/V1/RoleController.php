<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RoleController extends Controller
{
    private const SYSTEM_ROLES = ['super_admin', 'procurement_manager', 'procurement_officer', 'store_keeper', 'accountant', 'supplier'];
    public function index(): JsonResponse
    {
        return ApiResponse::success([
            'roles' => Role::with('permissions:id,name,group')->withCount('permissions')->orderBy('id')->get(),
            'permissions' => Permission::orderBy('group')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['label' => ['required', 'string', 'max:100', 'unique:roles,label'], 'permission_ids' => ['array'], 'permission_ids.*' => ['integer', 'exists:permissions,id']]);
        $role = Role::create(['name' => Str::snake($data['label']), 'label' => $data['label']]);
        $role->permissions()->sync($this->withOrganizationAccess($data['permission_ids'] ?? []));
        return ApiResponse::success($role->load('permissions'), 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        abort_if(in_array($role->name, self::SYSTEM_ROLES, true) && $request->has('label') && $request->input('label') !== $role->label, 422, 'System role names cannot be changed.');
        $data = $request->validate(['label' => ['sometimes', 'string', 'max:100'], 'permission_ids' => ['sometimes', 'array'], 'permission_ids.*' => ['integer', 'exists:permissions,id']]);
        if (isset($data['label']) && ! in_array($role->name, self::SYSTEM_ROLES, true)) $role->update(['label' => $data['label']]);
        if (isset($data['permission_ids'])) $role->permissions()->sync($role->name === 'super_admin' ? Permission::pluck('id') : $this->withOrganizationAccess($data['permission_ids']));
        return ApiResponse::success($role->load('permissions'));
    }

    private function withOrganizationAccess(array $permissionIds): array
    {
        $organizationView = Permission::where('name', 'locations.view')->value('id');
        $permissionNames = Permission::whereIn('id', $permissionIds)->pluck('name')->all();
        $dependencies = [];
        if (in_array('sales.create', $permissionNames, true)) {
            $dependencies = ['sales.view', 'inventory.view', 'customers.view'];
        }
        if (in_array('logistics.view', $permissionNames, true)) {
            $dependencies = [...$dependencies, 'inventory.view', 'customers.view'];
        }
        if (in_array('calendar.manage', $permissionNames, true)) $dependencies[] = 'calendar.view';
        if (in_array('departments.manage', $permissionNames, true)) $dependencies[] = 'departments.view';
        if (in_array('announcements.manage', $permissionNames, true)) $dependencies[] = 'announcements.view';
        $dependencyIds = Permission::whereIn('name', $dependencies)->pluck('id')->all();
        return array_values(array_unique([...$permissionIds, ...$dependencyIds, ...($organizationView ? [(int) $organizationView] : [])]));
    }

    public function destroy(Role $role): JsonResponse
    {
        abort_if(in_array($role->name, self::SYSTEM_ROLES, true), 422, 'System roles cannot be deleted.');
        abort_if($role->users()->exists(), 422, 'Reassign users before deleting this role.');
        $role->delete();
        return ApiResponse::success(['deleted' => true]);
    }
}
