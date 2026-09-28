<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\{Branch, Department, Organization, Store, Warehouse};
use App\Services\OrganizationDeletionService;
use App\Support\ApiResponse;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrganizationStructureController extends Controller
{
    private function organizationId(Request $request): int { return (int) $request->user()->organization_id; }
    public function companies(Request $request): JsonResponse
    {
        $query = Organization::query();
        if ($request->user()->primaryRole() !== 'super_admin') $query->whereKey($this->organizationId($request));
        return ApiResponse::success($query->orderBy('name')->get(['id', 'name', 'code', 'timezone', 'currency', 'email', 'phone', 'address', 'tin', 'vrn', 'is_active', 'created_at', 'updated_at']));
    }
    public function storeCompany(Request $request): JsonResponse
    {
        abort_unless($request->user()->primaryRole() === 'super_admin', 403, 'Only a super administrator can create companies.');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:50', 'unique:organizations,code'],
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'tin' => ['nullable', 'string', 'max:50'],
            'vrn' => ['nullable', 'string', 'max:50'],
            'is_active' => ['boolean'],
        ]);
        $company = Organization::create($data);
        return ApiResponse::success($company, 201);
    }
    public function destroyCompany(Request $request, Organization $organization, OrganizationDeletionService $deletionService): JsonResponse
    {
        abort_unless($request->user()->primaryRole() === 'super_admin', 403, 'Only a super administrator can delete companies.');
        abort_if((int) $organization->id === (int) $request->user()->organization_id, 422, 'You cannot delete the company you are currently signed in to.');
        return ApiResponse::success($deletionService->delete($organization));
    }
    public function branches(Request $request): JsonResponse { return ApiResponse::success(Branch::where('organization_id', $this->organizationId($request))->orderBy('name')->get()); }
    public function departments(Request $request): JsonResponse { return ApiResponse::success(Department::where('organization_id', $this->organizationId($request))->with('branch:id,name')->orderBy('name')->get()); }
    public function warehouses(Request $request): JsonResponse { return ApiResponse::success(['warehouses' => Warehouse::where('organization_id', $this->organizationId($request))->with('branch:id,name')->orderBy('name')->get(), 'stores' => Store::where('organization_id', $this->organizationId($request))->with('branch:id,name')->orderBy('name')->get()]); }

    public function storeBranch(Request $request): JsonResponse { return $this->save($request, new Branch, 'branch'); }
    public function updateBranch(Request $request, Branch $branch): JsonResponse { return $this->save($request, $branch, 'branch'); }
    public function destroyBranch(Request $request, Branch $branch): JsonResponse { $this->owned($request, $branch); abort_if($branch->stores()->exists() || $branch->warehouses()->exists() || Department::where('branch_id', $branch->id)->exists(), 422, 'Remove linked departments and locations first.'); $branch->delete(); return ApiResponse::success(['deleted' => true]); }
    public function storeDepartment(Request $request): JsonResponse { return $this->save($request, new Department, 'department'); }
    public function updateDepartment(Request $request, Department $department): JsonResponse { return $this->save($request, $department, 'department'); }
    public function destroyDepartment(Request $request, Department $department): JsonResponse { $this->owned($request, $department); $department->delete(); return ApiResponse::success(['deleted' => true]); }
    public function storeLocation(Request $request, string $type): JsonResponse { return $this->save($request, $type === 'store' ? new Store : new Warehouse, $type); }
    public function updateLocation(Request $request, string $type, int $id): JsonResponse { $model = ($type === 'store' ? Store::class : Warehouse::class)::findOrFail($id); return $this->save($request, $model, $type); }
    public function destroyLocation(Request $request, string $type, int $id): JsonResponse { $model = ($type === 'store' ? Store::class : Warehouse::class)::findOrFail($id); $this->owned($request, $model); $model->delete(); return ApiResponse::success(['deleted' => true]); }
    public function updateCompany(Request $request): JsonResponse { $company = Organization::findOrFail($this->organizationId($request)); $data = $request->validate(['name' => ['required','string','max:255'], 'code' => ['required','string','max:50',Rule::unique('organizations')->ignore($company)], 'email' => ['nullable','email'], 'phone' => ['nullable','string','max:50'], 'address' => ['nullable','string','max:1000'], 'tin' => ['nullable','string','max:50'], 'vrn' => ['nullable','string','max:50'], 'is_active' => ['boolean']]); $company->update($data); return ApiResponse::success($company); }
    public function updateCompanyById(Request $request, Organization $organization): JsonResponse
    {
        if ($request->user()->primaryRole() !== 'super_admin') $this->owned($request, $organization);
        $data = $request->validate(['name' => ['required','string','max:255'], 'code' => ['required','string','max:50',Rule::unique('organizations')->ignore($organization)], 'email' => ['nullable','email'], 'phone' => ['nullable','string','max:50'], 'address' => ['nullable','string','max:1000'], 'tin' => ['nullable','string','max:50'], 'vrn' => ['nullable','string','max:50'], 'is_active' => ['boolean']]);
        $organization->update($data);
        return ApiResponse::success($organization->fresh());
    }

    private function save(Request $request, Model $model, string $kind): JsonResponse
    {
        if ($model->exists) $this->owned($request, $model);
        $org = $this->organizationId($request); $table = $model->getTable();
        $rules = ['name' => ['required','string','max:255'], 'code' => ['required','string','max:50',Rule::unique($table)->where('organization_id', $org)->ignore($model)], 'email' => ['nullable','email'], 'phone' => ['nullable','string','max:50'], 'is_active' => ['boolean']];
        if ($kind !== 'branch') { $rules['branch_id'] = ['required','integer',Rule::exists('branches','id')->where('organization_id', $org)]; }
        if (in_array($kind, ['branch', 'store', 'warehouse'], true)) $rules['address'] = ['nullable','string','max:1000'];
        $data = $request->validate($rules); $data['organization_id'] = $org; $model->fill($data)->save();
        return ApiResponse::success($model->fresh()->loadMissing($kind === 'branch' ? [] : ['branch:id,name']), $model->wasRecentlyCreated ? 201 : 200);
    }
    private function owned(Request $request, Model $model): void { abort_unless((int) $model->getAttribute('organization_id') === $this->organizationId($request), 404); }
}
