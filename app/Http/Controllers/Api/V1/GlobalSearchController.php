<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Models\WorkshopStaff;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GlobalSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $term = trim($request->string('q')->toString());
        if (mb_strlen($term) < 2) return ApiResponse::success(['results' => []]);

        $organizationId = $request->user()->organization_id;
        $like = '%'.$term.'%';
        $results = [];
        $add = function ($items) use (&$results): void { $results = [...$results, ...$items->all()]; };

        if ($request->user()->hasPermission('inventory.view')) {
            $add(Product::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('sku', 'like', $like)->orWhere('barcode', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('Product', $item->name, 'SKU: '.$item->sku, '/inventory', 'Inventory')));
        }
        if ($request->user()->hasPermission('suppliers.view')) {
            $add(Supplier::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('Supplier', $item->name, $item->email ?: ($item->phone ?: 'Supplier record'), '/suppliers', 'Inventory & Stores')));
        }
        if ($request->user()->hasPermission('customers.view')) {
            $add(Customer::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('Customer', $item->name, $item->email ?: ($item->phone ?: 'Customer record'), '/customers', 'Inventory & Stores')));
        }
        if ($request->user()->hasPermission('purchase_orders.view')) {
            $add(PurchaseOrder::with('supplier:id,name')->where('organization_id', $organizationId)->where(fn ($query) => $query->where('po_number', 'like', $like)->orWhere('status', 'like', $like)->orWhere('notes', 'like', $like))->orderByDesc('id')->limit(8)->get()->map(fn ($item) => $this->result('Purchase Order', $item->po_number, ucfirst((string) $item->status).' · '.($item->supplier?->name ?? 'No supplier'), '/procurement', 'Procurement & Logistics')));
        }
        if ($request->user()->hasPermission('locations.view')) {
            $add(Warehouse::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('code', 'like', $like)->orWhere('address', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('Warehouse', $item->name, 'Code: '.$item->code, '/storage-locations', 'Inventory & Stores')));
        }
        if ($request->user()->hasPermission('users.view')) {
            $add(User::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('User', $item->name, $item->email, '/users', 'Administration')));
        }
        if ($request->user()->hasPermission('vehicles.view')) {
            $add(Vehicle::where('organization_id', $organizationId)->where(fn ($query) => $query->where('registration_number', 'like', $like)->orWhere('make', 'like', $like)->orWhere('model', 'like', $like))->orderBy('registration_number')->limit(8)->get()->map(fn ($item) => $this->result('Vehicle', $item->registration_number, trim(($item->make ?? '').' '.($item->model ?? '')), '/vehicles', 'Workshop Warehouse')));
        }
        if ($request->user()->hasPermission('staff.view')) {
            $add(WorkshopStaff::where('organization_id', $organizationId)->where(fn ($query) => $query->where('name', 'like', $like)->orWhere('staff_number', 'like', $like)->orWhere('department', 'like', $like))->orderBy('name')->limit(8)->get()->map(fn ($item) => $this->result('Workshop Staff', $item->name, $item->staff_number ?: ($item->department ?: 'Workshop staff'), '/staff', 'Workshop Warehouse')));
        }

        $add(Announcement::where('organization_id', $organizationId)->where(fn ($query) => $query->where('title', 'like', $like)->orWhere('summary', 'like', $like)->orWhere('content', 'like', $like))->orderByDesc('id')->limit(8)->get()->map(fn ($item) => $this->result('Announcement', $item->title, 'Organization announcement', '/announcements', 'System & Content')));

        return ApiResponse::success(['results' => array_slice($results, 0, 40)]);
    }

    private function result(string $type, string $label, string $description, string $path, string $group): array
    {
        return compact('type', 'label', 'description', 'path', 'group');
    }
}
