<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
return new class extends Migration {
 public function up():void {
  foreach(['data.export','data.import'] as $name) DB::table('permissions')->updateOrInsert(['name'=>$name],['group'=>'data_exchange','updated_at'=>now(),'created_at'=>now()]);
  $permissions=DB::table('permissions')->whereIn('name',['data.export','data.import'])->pluck('id','name');
  foreach(['super_admin','procurement_manager','procurement_officer','store_keeper'] as $roleName){$role=DB::table('roles')->where('name',$roleName)->first();if(!$role)continue;$names=$roleName==='procurement_manager'?['data.export']:['data.export','data.import'];foreach($names as $name)DB::table('permission_role')->updateOrInsert(['role_id'=>$role->id,'permission_id'=>$permissions[$name]],[]);}
 }
 public function down():void {$ids=DB::table('permissions')->whereIn('name',['data.export','data.import'])->pluck('id');DB::table('permission_role')->whereIn('permission_id',$ids)->delete();DB::table('permissions')->whereIn('id',$ids)->delete();}
};
