<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VehicleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Vehicle::where('organization_id', $request->user()->organization_id)->orderBy('registration_number')->get()->map(fn ($vehicle) => $this->payload($vehicle)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $vehicle = Vehicle::create(['organization_id' => $request->user()->organization_id, ...$data]);
        return response()->json($this->payload($vehicle), 201);
    }

    public function import(Request $request): JsonResponse
    {
        $data = $request->validate(['rows' => ['required', 'array', 'min:1', 'max:5000'], 'rows.*' => ['required', 'array']]);
        $organizationId = (int) $request->user()->organization_id;
        $prepared = [];
        $errors = [];

        foreach ($data['rows'] as $index => $row) {
            $registrationNumber = trim((string) ($row['registration_number'] ?? $row['registrationNumber'] ?? ''));
            if ($registrationNumber === '') {
                $errors[] = ['row' => $index + 2, 'errors' => ['Registration number is required.']];
                continue;
            }
            $status = strtolower(trim((string) ($row['status'] ?? 'available'))) ?: 'available';
            $prepared[] = [
                'registration_number' => strtoupper($registrationNumber),
                'make' => $this->nullableString($row['make'] ?? null),
                'model' => $this->nullableString($row['model'] ?? null),
                'vehicle_type' => $this->nullableString($row['vehicle_type'] ?? $row['type'] ?? null),
                'capacity' => $this->nullableInteger($row['capacity'] ?? null),
                'status' => $status,
                'last_service' => $this->nullableDate($row['last_service'] ?? null),
                'next_service' => $this->nullableDate($row['next_service'] ?? null),
                'department' => $this->nullableString($row['department'] ?? 'Workshop'),
                'is_active' => !in_array($status, ['inactive', 'retired', 'disposed'], true),
                'notes' => $this->nullableString($row['notes'] ?? null),
            ];
        }

        if ($errors) return response()->json(['message' => 'Vehicle import validation failed. No rows were saved.', 'errors' => ['rows' => $errors]], 422);

        DB::transaction(function () use ($prepared, $organizationId) {
            foreach ($prepared as $row) {
                $key = ['organization_id' => $organizationId, 'registration_number' => $row['registration_number']];
                Vehicle::updateOrCreate($key, collect($row)->except('registration_number')->all());
            }
        });

        return response()->json(['message' => count($prepared).' vehicles imported.', 'data' => ['imported' => count($prepared)]]);
    }

    public function update(Request $request, Vehicle $vehicle): JsonResponse
    {
        abort_unless($vehicle->organization_id === $request->user()->organization_id, 404);
        $vehicle->update($this->validated($request, $vehicle));
        return response()->json($this->payload($vehicle->refresh()));
    }

    public function destroy(Request $request, Vehicle $vehicle): JsonResponse
    {
        abort_unless($vehicle->organization_id === $request->user()->organization_id, 404);
        $vehicle->update(['is_active' => false]);
        return response()->json(null, 204);
    }

    private function validated(Request $request, ?Vehicle $vehicle = null): array
    {
        $data = $request->validate([
            'registrationNumber' => ['required', 'string', 'max:50', Rule::unique('vehicles', 'registration_number')->where('organization_id', $request->user()->organization_id)->ignore($vehicle?->id)],
            'make' => ['nullable', 'string', 'max:100'],
            'model' => ['nullable', 'string', 'max:100'],
            'vehicleType' => ['nullable', 'string', 'max:100'],
            'capacity' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'string', 'max:50'],
            'lastService' => ['nullable', 'date'],
            'nextService' => ['nullable', 'date'],
            'department' => ['nullable', 'string', 'max:150'],
            'isActive' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [], [
            'registrationNumber' => 'registration number', 'vehicleType' => 'vehicle type', 'isActive' => 'active status',
        ]);
        return ['registration_number' => strtoupper($data['registrationNumber']), 'make' => $data['make'] ?? null, 'model' => $data['model'] ?? null, 'vehicle_type' => $data['vehicleType'] ?? null, 'capacity' => $data['capacity'] ?? null, 'status' => $data['status'] ?? ($data['isActive'] ?? true ? 'available' : 'inactive'), 'last_service' => $data['lastService'] ?? null, 'next_service' => $data['nextService'] ?? null, 'department' => $data['department'] ?? null, 'is_active' => $data['isActive'] ?? true, 'notes' => $data['notes'] ?? null];
    }

    private function payload(Vehicle $vehicle): array
    {
        return ['id' => (string) $vehicle->id, 'registrationNumber' => $vehicle->registration_number, 'make' => $vehicle->make, 'model' => $vehicle->model, 'vehicleType' => $vehicle->vehicle_type, 'capacity' => $vehicle->capacity, 'status' => $vehicle->status, 'lastService' => $vehicle->last_service?->format('Y-m-d'), 'nextService' => $vehicle->next_service?->format('Y-m-d'), 'department' => $vehicle->department, 'isActive' => (bool) $vehicle->is_active, 'notes' => $vehicle->notes];
    }

    private function nullableString(mixed $value): ?string { $value = trim((string) ($value ?? '')); return $value === '' ? null : $value; }
    private function nullableInteger(mixed $value): ?int { return $value === null || trim((string) $value) === '' ? null : (int) $value; }
    private function nullableDate(mixed $value): ?string { $value = trim((string) ($value ?? '')); return $value === '' ? null : date('Y-m-d', strtotime($value)); }
}
