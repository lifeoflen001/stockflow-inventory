<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Http\{JsonResponse, Request};

class FrontendReadController extends Controller {
    public function emptyList(): JsonResponse { return response()->json([]); }
    public function emptyObject(): JsonResponse { return response()->json((object) []); }
    public function dashboardStats(): JsonResponse { return response()->json(['totalProducts'=>0,'todayRevenue'=>0,'todaySalesCount'=>0,'pendingPOs'=>0,'activeShipments'=>0,'totalSuppliers'=>0,'totalCustomers'=>0,'lowStockCount'=>0,'lowStockItems'=>[]]); }
    public function warehouses(Request $request): JsonResponse { return response()->json(Warehouse::where('organization_id',$request->user()->organization_id)->orderBy('name')->get()->map(fn($w)=>['_id'=>(string)$w->id,'name'=>$w->name,'address'=>$w->address,'city'=>null,'country'=>null,'phone'=>$w->phone,'isActive'=>$w->is_active])); }
    public function dailySummary(): JsonResponse { return response()->json(['totalSales'=>0,'totalRevenue'=>0,'totalDiscount'=>0,'totalTax'=>0,'paymentBreakdown'=>[]]); }
    public function salesReport(): JsonResponse { return response()->json(['totalRevenue'=>0,'totalTransactions'=>0,'avgOrderValue'=>0,'totalDiscount'=>0,'revenueByDay'=>[],'topProducts'=>[],'paymentMethods'=>[],'cashierStats'=>[]]); }
    public function inventoryReport(): JsonResponse { return response()->json(['totalSkus'=>0,'totalCostValue'=>0,'totalRetailValue'=>0,'potentialProfit'=>0,'lowStockCount'=>0,'outOfStockCount'=>0,'valuationByCategory'=>[],'productValuations'=>[],'lowStockItems'=>[]]); }
    public function procurementReport(): JsonResponse { return response()->json(['totalPOs'=>0,'totalSpend'=>0,'totalPaid'=>0,'totalOutstanding'=>0,'spendByDay'=>[],'spendBySupplier'=>[],'statusBreakdown'=>[]]); }
}
