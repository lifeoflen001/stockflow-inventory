<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $organization = Organization::updateOrCreate(['code' => 'STOCKFLOW'], ['name' => 'StockFlow Organization']);
            $branch = Branch::updateOrCreate(
                ['organization_id' => $organization->id, 'code' => 'HQ'],
                ['name' => 'Head Office', 'is_active' => true],
            );
            Store::updateOrCreate(
                ['organization_id' => $organization->id, 'code' => 'MAIN-STORE'],
                ['branch_id' => $branch->id, 'name' => 'Main Store', 'is_active' => true],
            );
            Warehouse::updateOrCreate(
                ['organization_id' => $organization->id, 'code' => 'MAIN-WH'],
                ['branch_id' => $branch->id, 'name' => 'Main Warehouse', 'is_active' => true],
            );

            $permissionGroups = [
                'locations' => ['locations.view', 'locations.manage'],
                'calendar' => ['calendar.view', 'calendar.manage'],
                'departments' => ['departments.view', 'departments.manage'],
                'users' => ['users.view', 'users.manage', 'roles.assign'],
                'requisitions' => ['requisitions.view', 'requisitions.create', 'requisitions.approve'],
                'purchase_orders' => ['purchase_orders.view', 'purchase_orders.create', 'purchase_orders.approve', 'purchase_orders.issue', 'purchase_orders.payment_verify'],
                'supplier_portal' => ['supplier_orders.view', 'supplier_orders.respond', 'supplier_documents.upload', 'supplier_catalog.manage'],
                'master_data' => ['master_data.manage'],
                'goods_receipts' => ['goods_receipts.view', 'goods_receipts.create', 'goods_receipts.inspect', 'goods_receipts.post'],
                'inventory' => ['inventory.view', 'stock.adjust', 'stock.issue', 'stock.transfer.dispatch', 'stock.transfer.receive', 'stock.count'],
                'sales' => ['sales.view', 'sales.create', 'sales.void', 'returns.approve'],
                'logistics' => ['logistics.view', 'logistics.manage'],
                'customers' => ['customers.view'],
                'suppliers' => ['suppliers.view'],
                'media' => ['media.view'],
                'vehicles' => ['vehicles.view', 'vehicles.manage'],
                'staff' => ['staff.view', 'staff.manage'],
                'workshop' => ['workshop.issues.view', 'workshop.issues.create'],
                'warehouse_locator' => ['warehouse_locator.view', 'warehouse_locator.manage'],
                'reports' => ['reports.view', 'audit.view'],
                'data_exchange' => ['data.export', 'data.import'],
                'department' => ['department.view', 'department.orders.view', 'department.orders.create'],
                'petty_cash' => ['petty_cash.view', 'petty_cash.create'],
                'announcements' => ['announcements.view', 'announcements.manage'],
                'notifications' => ['notifications.manage'],
                'offline' => ['offline.sync'],
            ];
            foreach ($permissionGroups as $group => $names) {
                foreach ($names as $name) Permission::firstOrCreate(['name' => $name], ['group' => $group]);
            }

            $roles = [
                'super_admin' => ['label' => 'Super Admin', 'permissions' => Permission::pluck('name')->all()],
                'procurement_manager' => ['label' => 'Procurement Manager', 'permissions' => ['locations.view', 'calendar.view', 'departments.view', 'announcements.view', 'requisitions.view', 'requisitions.approve', 'purchase_orders.view', 'purchase_orders.approve', 'master_data.manage', 'goods_receipts.view', 'suppliers.view', 'logistics.view', 'reports.view', 'data.export', 'petty_cash.view', 'offline.sync']],
                'procurement_officer' => ['label' => 'Procurement Officer', 'permissions' => ['locations.view', 'calendar.view', 'departments.view', 'announcements.view', 'requisitions.view', 'requisitions.create', 'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.issue', 'master_data.manage', 'goods_receipts.view', 'suppliers.view', 'logistics.view', 'reports.view', 'data.export', 'data.import', 'petty_cash.view', 'petty_cash.create', 'offline.sync']],
            'store_keeper' => ['label' => 'Store Keeper', 'permissions' => ['locations.view', 'calendar.view', 'departments.view', 'announcements.view', 'warehouse_locator.view', 'warehouse_locator.manage', 'requisitions.view', 'requisitions.create', 'purchase_orders.view', 'goods_receipts.view', 'goods_receipts.create', 'goods_receipts.inspect', 'goods_receipts.post', 'inventory.view', 'stock.adjust', 'stock.issue', 'stock.transfer.dispatch', 'stock.transfer.receive', 'stock.count', 'vehicles.view', 'staff.view', 'workshop.issues.view', 'workshop.issues.create', 'data.export', 'offline.sync']],
                'department_manager' => ['label' => 'Department Manager', 'permissions' => ['locations.view', 'calendar.view', 'departments.view', 'announcements.view', 'inventory.view', 'department.view', 'department.orders.view', 'department.orders.create']],
                'accountant' => ['label' => 'Accountant', 'permissions' => ['announcements.view', 'purchase_orders.view', 'purchase_orders.payment_verify', 'reports.view']],
                'supplier' => ['label' => 'Supplier', 'permissions' => ['announcements.view', 'supplier_orders.view', 'supplier_orders.respond', 'supplier_documents.upload', 'supplier_catalog.manage']],
            ];
            foreach ($roles as $name => $definition) {
                $role = Role::updateOrCreate(['name' => $name], ['label' => $definition['label']]);
                $role->permissions()->sync(Permission::whereIn('name', $definition['permissions'])->pluck('id'));
            }

            // Never create a usable administrator from seeded or .env credentials
            // outside tests. Production setup uses the interactive command so the
            // owner chooses the account and password explicitly.
            if (app()->environment('testing')) {
                $user = User::updateOrCreate(
                    ['email' => 'admin@stockflow.local'],
                    ['organization_id' => $organization->id, 'name' => 'System Administrator', 'password' => 'StockFlow@2026!', 'is_active' => true, 'email_verified_at' => now()],
                );
                $superAdmin = Role::where('name', 'super_admin')->firstOrFail();
                $user->roles()->sync([$superAdmin->id => ['organization_id' => $organization->id]]);
            }
        });
    }
}
