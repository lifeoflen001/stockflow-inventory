<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Store;
use App\Models\Warehouse;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organizationId = $request->user()->organization_id;
        return ApiResponse::success([
            'branches' => Branch::where('organization_id', $organizationId)->with(['stores', 'warehouses'])->get(),
            'stores' => Store::where('organization_id', $organizationId)->get(),
            'warehouses' => Warehouse::where('organization_id', $organizationId)->get(),
        ]);
    }
}
