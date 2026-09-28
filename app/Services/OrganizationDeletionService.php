<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class OrganizationDeletionService
{
    /**
     * Permanently removes one organization and every record owned by it.
     *
     * Files are collected before the database transaction and removed only
     * after the transaction succeeds, so a failed database delete does not
     * leave the database pointing at missing files.
     */
    public function delete(Organization $organization): array
    {
        $organizationId = (int) $organization->id;
        $files = $this->filesForOrganization($organizationId);
        $userIds = DB::table('users')->where('organization_id', $organizationId)->pluck('id')->all();
        $userEmails = DB::table('users')->whereIn('id', $userIds)->pluck('email')->all();
        $purchaseOrderIds = DB::table('purchase_orders')->where('organization_id', $organizationId)->pluck('id')->all();
        $priceListIds = DB::table('price_lists')->where('organization_id', $organizationId)->pluck('id')->all();
        $workshopBatchIds = DB::table('workshop_issue_batches')->where('organization_id', $organizationId)->pluck('id')->all();

        DB::transaction(function () use ($organization, $organizationId, $userIds, $userEmails, $purchaseOrderIds, $priceListIds, $workshopBatchIds): void {
            // Remove records that reference purchase orders, suppliers,
            // products, warehouses, or users with restrictive foreign keys.
            $this->deleteWhereIn('purchase_order_documents', 'purchase_order_id', $purchaseOrderIds);
            $this->deleteWhereIn('purchase_order_comments', 'purchase_order_id', $purchaseOrderIds);
            $this->deleteWhereIn('purchase_order_payments', 'purchase_order_id', $purchaseOrderIds);
            $this->deleteWhereIn('purchase_order_items', 'purchase_order_id', $purchaseOrderIds);
            $supplierIds = $this->ids('suppliers', $organizationId);
            $this->deleteWhereIn('supplier_returns', 'supplier_id', $supplierIds);
            $this->deleteWhereIn('purchase_orders', 'id', $purchaseOrderIds);

            $this->deleteWhereIn('supplier_contacts', 'supplier_id', $supplierIds);
            $this->deleteWhereIn('supplier_commercial_terms', 'supplier_id', $supplierIds);
            $this->deleteWhereIn('supplier_product_mappings', 'supplier_id', $supplierIds);
            $this->deleteWhereIn('supplier_documents', 'supplier_id', $supplierIds);
            DB::table('suppliers')->where('organization_id', $organizationId)->delete();

            $this->deleteWhereIn('workshop_issue_items', 'workshop_issue_batch_id', $workshopBatchIds);
            DB::table('workshop_issue_batches')->where('organization_id', $organizationId)->delete();
            DB::table('stock_issues')->where('organization_id', $organizationId)->delete();
            DB::table('replenishment_requests')->where('organization_id', $organizationId)->delete();
            DB::table('warehouse_product_locations')->where('organization_id', $organizationId)->delete();
            DB::table('stock_balances')->where('organization_id', $organizationId)->delete();
            DB::table('stock_movements')->where('organization_id', $organizationId)->delete();

            $this->deleteWhereIn('price_list_items', 'price_list_id', $priceListIds);
            DB::table('price_lists')->where('organization_id', $organizationId)->delete();
            DB::table('products')->where('organization_id', $organizationId)->delete();
            DB::table('categories')->where('organization_id', $organizationId)->delete();
            DB::table('units')->where('organization_id', $organizationId)->delete();
            DB::table('customers')->where('organization_id', $organizationId)->delete();

            DB::table('media_assets')->where('organization_id', $organizationId)->delete();
            DB::table('media_folders')->where('organization_id', $organizationId)->delete();
            DB::table('system_backups')->where('organization_id', $organizationId)->delete();
            DB::table('petty_cash_vouchers')->where('organization_id', $organizationId)->delete();
            DB::table('calendar_events')->where('organization_id', $organizationId)->delete();
            DB::table('app_notifications')->where('organization_id', $organizationId)->delete();
            DB::table('announcements')->where('organization_id', $organizationId)->delete();
            DB::table('audit_logs')->where('organization_id', $organizationId)->delete();

            $this->deleteWhereIn('user_location_assignments', 'user_id', $userIds);
            DB::table('permission_user')->where('organization_id', $organizationId)->delete();
            DB::table('role_user')->where('organization_id', $organizationId)->delete();
            DB::table('user_invitations')->where('organization_id', $organizationId)->delete();
            $this->deleteWhereIn('sessions', 'user_id', $userIds);
            $this->deleteWhereIn('password_reset_tokens', 'email', $userEmails);
            DB::table('users')->where('organization_id', $organizationId)->delete();

            // These records have restrictive branch/location relationships,
            // so they are deleted after operational history and before the
            // organization itself.
            DB::table('stores')->where('organization_id', $organizationId)->delete();
            DB::table('warehouses')->where('organization_id', $organizationId)->delete();
            DB::table('departments')->where('organization_id', $organizationId)->delete();
            DB::table('workshop_staff')->where('organization_id', $organizationId)->delete();
            DB::table('vehicles')->where('organization_id', $organizationId)->delete();
            DB::table('branches')->where('organization_id', $organizationId)->delete();

            $organization->delete();
        });

        foreach ($files as $file) {
            Storage::disk($file['disk'])->delete($file['path']);
        }

        return [
            'deleted' => true,
            'users' => count($userIds),
            'purchaseOrders' => count($purchaseOrderIds),
            'files' => $files->count(),
        ];
    }

    private function filesForOrganization(int $organizationId): Collection
    {
        $files = collect();
        foreach (['media_assets', 'system_backups'] as $table) {
            $files = $files->merge(DB::table($table)->where('organization_id', $organizationId)->get(['disk', 'path'])->map(fn ($file) => ['disk' => $file->disk, 'path' => $file->path]));
        }

        $supplierIds = $this->ids('suppliers', $organizationId);
        if ($supplierIds) {
            $files = $files->merge(DB::table('supplier_documents')->whereIn('supplier_id', $supplierIds)->get(['disk', 'path'])->map(fn ($file) => ['disk' => $file->disk, 'path' => $file->path]));
        }

        $purchaseOrderIds = DB::table('purchase_orders')->where('organization_id', $organizationId)->pluck('id')->all();
        if ($purchaseOrderIds) {
            $files = $files->merge(DB::table('purchase_order_documents')->whereIn('purchase_order_id', $purchaseOrderIds)->get(['disk', 'path'])->map(fn ($file) => ['disk' => $file->disk, 'path' => $file->path]));
        }

        $userFiles = DB::table('users')->where('organization_id', $organizationId)->get(['avatar_path', 'signature_path']);
        foreach ($userFiles as $user) {
            foreach ([$user->avatar_path, $user->signature_path] as $path) {
                if ($path) $files->push(['disk' => 'public', 'path' => $path]);
            }
        }

        return $files->filter(fn (array $file) => ! empty($file['path']))->unique(fn (array $file) => $file['disk'].'|'.$file['path'])->values();
    }

    private function ids(string $table, int $organizationId): array
    {
        return DB::table($table)->where('organization_id', $organizationId)->pluck('id')->all();
    }

    private function deleteWhereIn(string $table, string $column, array $ids): void
    {
        if ($ids) DB::table($table)->whereIn($column, $ids)->delete();
    }
}
