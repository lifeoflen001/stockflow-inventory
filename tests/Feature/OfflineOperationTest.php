<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OfflineOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_offline_adjustment_is_idempotent_and_conflicts_when_stock_changed(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $headers = ['Authorization' => 'Bearer '.$token];
        $product = $this->postJson('/api/v1/products', ['sku' => 'OFFLINE-1', 'name' => 'Offline Test', 'costPrice' => 10, 'sellingPrice' => 12], $headers)->assertCreated()->json('_id');
        $warehouse = $this->getJson('/api/v1/warehouses', $headers)->json('0._id');
        $this->postJson('/api/v1/inventory/adjustments', ['productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'type' => 'add', 'quantity' => 20], $headers)->assertCreated();
        $operation = ['operationId' => '00000000-0000-4000-8000-000000000001', 'deviceId' => 'test-device', 'operationType' => 'stock_adjustment', 'payload' => ['productId' => (int) $product, 'warehouseId' => (int) $warehouse, 'type' => 'remove', 'quantity' => 5, 'baseQuantity' => 20], 'clientCreatedAt' => now()->toIso8601String()];
        $this->postJson('/api/v1/offline/sync', ['operations' => [$operation]], $headers)->assertOk()->assertJsonPath('data.results.0.status', 'synchronized');
        $this->postJson('/api/v1/offline/sync', ['operations' => [$operation]], $headers)->assertOk()->assertJsonPath('data.results.0.status', 'synchronized');
        $this->assertDatabaseHas('stock_balances', ['product_id' => $product, 'warehouse_id' => $warehouse, 'quantity' => 15]);
        $conflict = $operation; $conflict['operationId'] = '00000000-0000-4000-8000-000000000002'; $conflict['payload']['quantity'] = 2;
        $this->postJson('/api/v1/offline/sync', ['operations' => [$conflict]], $headers)->assertOk()->assertJsonPath('data.results.0.status', 'conflict');
    }

    public function test_offline_sync_is_protected_by_operation_permissions(): void
    {
        $this->seed();
        $user = User::create(['organization_id' => 1, 'name' => 'Department User', 'email' => 'offline-department@test.local', 'password' => 'Secret@2026!', 'is_active' => true, 'email_verified_at' => now()]);
        $user->forceFill(['email_verified_at' => now()])->save();
        $role = \App\Models\Role::where('name', 'department_manager')->firstOrFail();
        $user->roles()->attach($role->id, ['organization_id' => 1]);
        $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Secret@2026!'])->json('token');
        $this->postJson('/api/v1/offline/sync', ['operations' => []], ['Authorization' => 'Bearer '.$token])->assertForbidden();
    }
}
