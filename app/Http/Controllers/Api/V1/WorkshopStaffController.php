<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WorkshopStaff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkshopStaffController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(WorkshopStaff::where('organization_id', $request->user()->organization_id)->orderBy('name')->get()->map(fn ($staff) => $this->payload($staff)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $staff = WorkshopStaff::create(['organization_id' => $request->user()->organization_id, ...$data]);
        return response()->json($this->payload($staff), 201);
    }

    public function import(Request $request): JsonResponse
    {
        $data = $request->validate(['rows' => ['required', 'array', 'min:1', 'max:5000'], 'rows.*' => ['required', 'array']]);
        $organizationId = (int) $request->user()->organization_id;
        $prepared = [];
        $errors = [];

        foreach ($data['rows'] as $index => $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                $errors[] = ['row' => $index + 2, 'errors' => ['Name is required.']];
                continue;
            }
            $prepared[] = [
                'staff_number' => $this->nullableString($row['staff_number'] ?? $row['staffNumber'] ?? null),
                'name' => $name,
                'position' => $this->nullableString($row['position'] ?? null),
                'department' => $this->nullableString($row['department'] ?? 'Workshop'),
                'phone' => $this->nullableString($row['phone'] ?? null),
                'email' => $this->nullableString($row['email'] ?? null),
                'is_active' => true,
            ];
        }

        if ($errors) return response()->json(['message' => 'Staff import validation failed. No rows were saved.', 'errors' => ['rows' => $errors]], 422);

        DB::transaction(function () use ($prepared, $organizationId) {
            foreach ($prepared as $row) {
                if ($row['staff_number']) {
                    WorkshopStaff::updateOrCreate(['organization_id' => $organizationId, 'staff_number' => $row['staff_number']], collect($row)->except('staff_number')->all());
                } else {
                    WorkshopStaff::create(['organization_id' => $organizationId, ...$row]);
                }
            }
        });

        return response()->json(['message' => count($prepared).' staff members imported.', 'data' => ['imported' => count($prepared)]]);
    }

    public function update(Request $request, WorkshopStaff $staff): JsonResponse
    {
        abort_unless($staff->organization_id === $request->user()->organization_id, 404);
        $staff->update($this->validated($request, $staff));
        return response()->json($this->payload($staff->refresh()));
    }

    public function destroy(Request $request, WorkshopStaff $staff): JsonResponse
    {
        abort_unless($staff->organization_id === $request->user()->organization_id, 404);
        $staff->update(['is_active' => false]);
        return response()->json(null, 204);
    }

    private function validated(Request $request, ?WorkshopStaff $staff = null): array
    {
        $data = $request->validate([
            'staffNumber' => ['nullable', 'string', 'max:50', Rule::unique('workshop_staff', 'staff_number')->where('organization_id', $request->user()->organization_id)->ignore($staff?->id)],
            'name' => ['required', 'string', 'max:150'],
            'position' => ['nullable', 'string', 'max:150'],
            'department' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:150'],
            'isActive' => ['sometimes', 'boolean'],
        ]);
        return ['staff_number' => $data['staffNumber'] ?? null, 'name' => $data['name'], 'position' => $data['position'] ?? null, 'department' => $data['department'] ?? null, 'phone' => $data['phone'] ?? null, 'email' => $data['email'] ?? null, 'is_active' => $data['isActive'] ?? true];
    }

    private function payload(WorkshopStaff $staff): array
    {
        return ['id' => (string) $staff->id, 'staffNumber' => $staff->staff_number, 'name' => $staff->name, 'position' => $staff->position, 'department' => $staff->department, 'phone' => $staff->phone, 'email' => $staff->email, 'isActive' => (bool) $staff->is_active];
    }

    private function nullableString(mixed $value): ?string { $value = trim((string) ($value ?? '')); return $value === '' ? null : $value; }
}
