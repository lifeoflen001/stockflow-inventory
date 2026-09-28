<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
class MasterDataTest extends TestCase {
 use RefreshDatabase;
 public function test_superuser_can_create_master_data():void {
  $this->seed(); $token=$this->postJson('/api/v1/auth/login',['email'=>'admin@stockflow.local','password'=>'StockFlow@2026!'])->json('token'); $h=['Authorization'=>'Bearer '.$token];
  $branch=$this->postJson('/api/v1/branches',['name'=>'Main Branch','code'=>'MAIN','email'=>'main@example.com','phone'=>'123','is_active'=>true],$h)->assertCreated()->json('data.id');
  $this->postJson('/api/v1/departments',['name'=>'Stores','code'=>'STR','branch_id'=>$branch,'is_active'=>true],$h)->assertCreated();
  $category=$this->postJson('/api/v1/categories',['name'=>'General','color'=>'#22c55e'],$h)->assertCreated()->json('_id');
  $unit=$this->postJson('/api/v1/units',['name'=>'Piece','abbreviation'=>'pc'],$h)->assertCreated()->json('_id');
  $product=$this->postJson('/api/v1/products',['sku'=>'SKU-1','name'=>'Test Product','costPrice'=>10,'sellingPrice'=>15,'categoryId'=>(int)$category,'unitId'=>(int)$unit],$h)->assertCreated()->json('_id');
  $this->withHeaders($h)->getJson("/api/v1/products/{$product}")->assertOk()->assertJsonPath('category.name','General')->assertJsonPath('unit.name','Piece')->assertJsonPath('stock',[]);
  $this->postJson('/api/v1/suppliers',['name'=>'Test Supplier','email'=>'supplier@example.com','tin'=>'TIN-123','vrn'=>'VRN-456'],$h)->assertCreated()->assertJsonPath('tin','TIN-123')->assertJsonPath('vrn','VRN-456');
  $this->postJson('/api/v1/customers',['name'=>'Test Customer','customerType'=>'retail'],$h)->assertCreated();
  $this->postJson('/api/v1/warehouses',['name'=>'Main Warehouse','address'=>'Test address'],$h)->assertCreated();
  $this->assertDatabaseHas('products',['organization_id'=>1,'sku'=>'SKU-1']); $this->assertDatabaseHas('customers',['name'=>'Test Customer']);
 }
}
