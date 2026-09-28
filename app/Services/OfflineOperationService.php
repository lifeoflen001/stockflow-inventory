<?php

namespace App\Services;

use App\Exceptions\OfflineConflictException;
use App\Models\{OfflineOperation, Product, PurchaseOrder, PurchaseOrderItem, StockBalance, StockIssue, StockMovement, User, Warehouse};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Database\QueryException;
use Throwable;

class OfflineOperationService
{
    public function __construct(private NotificationService $notifications) {}

    public function sync(User $user, array $operations): array
    {
        return collect($operations)->map(fn (array $input) => $this->process($user, $input))->values()->all();
    }

    public function process(User $user, array $input): array
    {
        $operationId = (string) ($input['operationId'] ?? '');
        if (! Str::isUuid($operationId) && ! preg_match('/^[A-Za-z0-9._:-]{8,100}$/', $operationId)) {
            return ['operationId' => $operationId, 'status' => 'failed', 'error' => 'A valid client operation ID is required.'];
        }

        try {
            $operation = OfflineOperation::query()->firstOrCreate(['operation_id' => $operationId], [
                'organization_id' => $user->organization_id,
                'user_id' => $user->id,
                'device_id' => (string) ($input['deviceId'] ?? 'unknown-device'),
                'operation_type' => (string) ($input['operationType'] ?? ''),
                'status' => 'pending',
                'payload' => (array) ($input['payload'] ?? []),
                'base_versions' => (array) ($input['baseVersions'] ?? []),
                'client_created_at' => $input['clientCreatedAt'] ?? now(),
            ]);
        } catch (QueryException $exception) {
            if (! str_contains($exception->getMessage(), 'operation_id')) throw $exception;
            $operation = OfflineOperation::query()->where('operation_id', $operationId)->firstOrFail();
        }
        abort_unless((int) $operation->organization_id === (int) $user->organization_id && (int) $operation->user_id === (int) $user->id, 403);
        if ($operation->status === 'synchronized') return $this->payload($operation);

        $type = (string) ($input['operationType'] ?? $operation->operation_type);
        $payload = (array) ($input['payload'] ?? $operation->payload);
        try {
            $this->authorize($user, $type);
            $operation->update(['status' => 'syncing', 'attempts' => $operation->attempts + 1, 'last_error' => null]);
            $result = DB::transaction(fn () => match ($type) {
                'stock_count' => $this->stockCount($user, $payload),
                'stock_adjustment' => $this->stockAdjustment($user, $payload),
                'issue_stock' => $this->issueStock($user, $payload),
                'transfer_stock' => $this->transferStock($user, $payload),
                default => throw new \InvalidArgumentException('Unsupported offline operation: '.$type),
            });
            $operation->update(['status' => 'synchronized', 'result' => $result, 'server_processed_at' => now(), 'last_error' => null, 'conflict_data' => null]);
        } catch (OfflineConflictException $exception) {
            $operation->update(['status' => 'conflict', 'last_error' => $exception->getMessage(), 'conflict_data' => $exception->context]);
        } catch (Throwable $exception) {
            report($exception);
            $operation->update(['status' => 'failed', 'last_error' => $exception->getMessage(), 'server_processed_at' => now()]);
            $this->notifications->notifySynchronizationFailure($user->organization_id, $type, $exception->getMessage(), ['operation_id' => $operationId, 'user_id' => $user->id]);
        }
        return $this->payload($operation->fresh());
    }

    public function retry(User $user, OfflineOperation $operation): array
    {
        abort_unless((int) $operation->organization_id === (int) $user->organization_id && (int) $operation->user_id === (int) $user->id, 404);
        return $this->process($user, ['operationId' => $operation->operation_id, 'deviceId' => $operation->device_id, 'operationType' => $operation->operation_type, 'payload' => $operation->payload, 'baseVersions' => $operation->base_versions, 'clientCreatedAt' => $operation->client_created_at?->toIso8601String()]);
    }

    public function payload(OfflineOperation $operation): array
    {
        return ['id' => (string) $operation->id, 'operationId' => $operation->operation_id, 'deviceId' => $operation->device_id, 'operationType' => $operation->operation_type, 'status' => $operation->status, 'payload' => $operation->payload, 'result' => $operation->result, 'attempts' => (int) $operation->attempts, 'error' => $operation->last_error, 'conflict' => $operation->conflict_data, 'clientCreatedAt' => $operation->client_created_at?->toIso8601String(), 'processedAt' => $operation->server_processed_at?->toIso8601String()];
    }

    private function authorize(User $user, string $type): void
    {
        $permission = ['stock_count' => 'stock.count', 'stock_adjustment' => 'stock.adjust', 'issue_stock' => 'stock.issue', 'transfer_stock' => 'stock.transfer.dispatch'][$type] ?? null;
        abort_unless($permission && $user->hasPermission($permission), 403, 'Your current permissions do not allow this offline operation.');
    }

    private function stockCount(User $user, array $data): array
    {
        $base = $this->requiredBase($data);
        $product = $this->product($user, $data);
        $warehouse = $this->warehouse($user, $data);
        $balance = $this->balance($user, $product, $warehouse);
        $this->assertUnchanged($balance->quantity, $base, ['productId' => $product->id, 'warehouseId' => $warehouse->id]);
        $counted = $this->number($data, 'countedQuantity');
        if ($counted < 0) throw new OfflineConflictException('A stock count cannot be negative.', ['countedQuantity' => $counted]);
        $delta = $counted - (float) $balance->quantity;
        $balance->update(['quantity' => $counted]);
        StockMovement::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $user->id, 'type' => 'count', 'quantity' => abs($delta), 'balance_after' => $counted, 'reason' => (string) ($data['reason'] ?? 'Offline stock count'), 'reference' => filled($data['operationReference'] ?? null) ? 'OFF-'.$data['operationReference'] : null]);
        $this->notifications->notifyStockLevel($product, $warehouse, $counted);
        return ['productId' => $product->id, 'warehouseId' => $warehouse->id, 'quantity' => $counted, 'delta' => $delta];
    }

    private function stockAdjustment(User $user, array $data): array
    {
        $base = $this->requiredBase($data); $product = $this->product($user, $data); $warehouse = $this->warehouse($user, $data); $balance = $this->balance($user, $product, $warehouse); $this->assertUnchanged($balance->quantity, $base, ['productId' => $product->id, 'warehouseId' => $warehouse->id]);
        $quantity = $this->number($data, 'quantity'); $type = (string) ($data['type'] ?? '');
        if (! in_array($type, ['add', 'remove'], true)) throw new \InvalidArgumentException('Offline adjustment type must be add or remove.');
        $next = $type === 'add' ? (float) $balance->quantity + $quantity : (float) $balance->quantity - $quantity;
        if ($next < 0) { $this->notifications->notifyNegativeInventoryAttempt($product, $warehouse, $quantity, $user->id); throw new OfflineConflictException('The adjustment would create negative inventory.', ['currentQuantity' => (float) $balance->quantity, 'requestedQuantity' => $quantity]); }
        $balance->update(['quantity' => $next]);
        StockMovement::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $user->id, 'type' => $type, 'quantity' => $quantity, 'balance_after' => $next, 'reason' => (string) ($data['reason'] ?? 'Offline adjustment')]);
        $this->notifications->notifyUnusualStockAdjustment($product, $warehouse, $quantity, (string) ($data['reason'] ?? ''), $user->id); $this->notifications->notifyStockLevel($product, $warehouse, $next);
        return ['productId' => $product->id, 'warehouseId' => $warehouse->id, 'quantity' => $next];
    }

    private function issueStock(User $user, array $data): array
    {
        $base = $this->requiredBase($data); $product = $this->product($user, $data); $warehouse = $this->warehouse($user, $data); $balance = $this->balance($user, $product, $warehouse); $this->assertUnchanged($balance->quantity, $base, ['productId' => $product->id, 'warehouseId' => $warehouse->id]); $quantity = $this->number($data, 'quantity');
        if ((float) $balance->quantity < $quantity) { $this->notifications->notifyNegativeInventoryAttempt($product, $warehouse, $quantity, $user->id); throw new OfflineConflictException('The issue would create negative inventory.', ['currentQuantity' => (float) $balance->quantity, 'requestedQuantity' => $quantity]); }
        $next = (float) $balance->quantity - $quantity; $balance->update(['quantity' => $next]); $reference = 'ISS-OFF-'.Str::upper(Str::random(8));
        StockIssue::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $user->id, 'reference' => $reference, 'issued_to' => (string) ($data['issuedTo'] ?? $user->name), 'recipient_contact' => $data['recipientContact'] ?? null, 'department' => $data['department'] ?? null, 'quantity' => $quantity, 'purpose' => $data['purpose'] ?? null, 'notes' => $data['notes'] ?? null, 'issued_at' => now()]);
        StockMovement::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'user_id' => $user->id, 'type' => 'issue', 'quantity' => $quantity, 'balance_after' => $next, 'reason' => 'Offline issue', 'reference' => $reference]); $this->notifications->notifyStockLevel($product, $warehouse, $next);
        return ['productId' => $product->id, 'warehouseId' => $warehouse->id, 'quantity' => $next, 'reference' => $reference];
    }

    private function transferStock(User $user, array $data): array
    {
        $base = $this->requiredBase($data); $product = $this->product($user, $data); $from = $this->warehouse($user, ['warehouseId' => $data['fromWarehouseId'] ?? null]); $to = $this->warehouse($user, ['warehouseId' => $data['toWarehouseId'] ?? null]); if ($from->id === $to->id) throw new \InvalidArgumentException('Transfer locations must be different.');
        $source = $this->balance($user, $product, $from); $destination = $this->balance($user, $product, $to); $this->assertUnchanged($source->quantity, $base, ['productId' => $product->id, 'warehouseId' => $from->id]); $quantity = $this->number($data, 'quantity'); if ((float) $source->quantity < $quantity) throw new OfflineConflictException('The transfer exceeds the available source quantity.', ['currentQuantity' => (float) $source->quantity, 'requestedQuantity' => $quantity]);
        $source->update(['quantity' => (float) $source->quantity - $quantity]); $destination->update(['quantity' => (float) $destination->quantity + $quantity]); $reference = 'TRF-OFF-'.Str::upper(Str::random(8));
        StockMovement::create(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'from_warehouse_id' => $from->id, 'to_warehouse_id' => $to->id, 'user_id' => $user->id, 'type' => 'transfer', 'quantity' => $quantity, 'balance_after' => (float) $destination->quantity, 'reason' => (string) ($data['reason'] ?? 'Offline transfer'), 'reference' => $reference]); $this->notifications->notifyStockLevel($product, $from, (float) $source->quantity); $this->notifications->notifyStockLevel($product, $to, (float) $destination->quantity);
        return ['productId' => $product->id, 'fromWarehouseId' => $from->id, 'toWarehouseId' => $to->id, 'quantity' => $quantity, 'reference' => $reference];
    }

    private function product(User $user, array $data): Product { return Product::query()->where('organization_id', $user->organization_id)->where('is_active', true)->findOrFail((int) ($data['productId'] ?? 0)); }
    private function warehouse(User $user, array $data): Warehouse { return Warehouse::query()->where('organization_id', $user->organization_id)->where('is_active', true)->findOrFail((int) ($data['warehouseId'] ?? 0)); }
    private function balance(User $user, Product $product, Warehouse $warehouse): StockBalance { $balance = StockBalance::query()->firstOrCreate(['organization_id' => $user->organization_id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id], ['quantity' => 0]); return StockBalance::query()->whereKey($balance->id)->lockForUpdate()->firstOrFail(); }
    private function requiredBase(array $data): float { if (! array_key_exists('baseQuantity', $data)) throw new OfflineConflictException('The offline operation is based on an outdated or incomplete stock snapshot.'); return (float) $data['baseQuantity']; }
    private function number(array $data, string $key): float { $value = (float) ($data[$key] ?? 0); if ($value <= 0) throw new \InvalidArgumentException($key.' must be greater than zero.'); return $value; }
    private function assertUnchanged(float $actual, float $expected, array $context): void { if (abs($actual - $expected) > 0.000001) throw new OfflineConflictException('Stock changed while this operation was offline. Review the current balance before retrying.', $context + ['baseQuantity' => $expected, 'currentQuantity' => $actual]); }
}
