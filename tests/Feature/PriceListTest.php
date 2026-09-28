<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PriceListTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_manage_yearly_price_lists_and_items(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!',
        ])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $list = $this->withHeaders($headers)->postJson('/api/v1/price-lists', [
            'name' => 'General Catalog', 'year' => 2026, 'currency' => 'TZS',
            'is_active' => true,
        ])->assertCreated()->json();

        $item = $this->withHeaders($headers)->postJson("/api/v1/price-lists/{$list['id']}/items", [
            'item_code' => 'SP-001', 'description' => 'Alternator',
            'item_type' => 'Auto Spare', 'unit' => 'Each',
            'unit_price' => 1170000, 'vat_rate' => 18,
        ])->assertCreated()->json();

        $this->withHeaders($headers)->getJson("/api/v1/price-lists/{$list['id']}")
            ->assertOk()
            ->assertJsonPath('year', 2026)
            ->assertJsonPath('items.0.id', $item['id'])
            ->assertJsonPath('items.0.item_type', 'Auto Spare');

        $this->assertDatabaseHas('price_list_items', [
            'price_list_id' => $list['id'], 'item_code' => 'SP-001',
            'unit_price' => 1170000,
        ]);
    }

    public function test_price_list_csv_rows_are_imported_transactionally(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!',
        ])->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $list = $this->withHeaders($headers)->postJson('/api/v1/price-lists', [
            'name' => 'Imported 2024 Prices', 'year' => 2024, 'currency' => 'TZS',
            'is_active' => true,
        ])->assertCreated()->json();

        $this->withHeaders($headers)->postJson('/api/v1/data-exchange/import/price-list-items', [
            'price_list_id' => $list['id'],
            'rows' => [
                ['PRODUCT' => 'Alternator', 'UNIT' => 'Each', 'UNIT PRICE (VAT EXCL)' => '1,170,000.00'],
                ['PRODUCT' => 'Battery', 'UNIT' => 'Each', 'UNIT PRICE (VAT EXCL)' => '450000'],
            ],
        ])->assertOk()->assertJsonPath('data.imported', 2);

        $this->assertDatabaseHas('price_list_items', [
            'price_list_id' => $list['id'], 'item_code' => 'IMPORTED-0001',
            'description' => 'Alternator', 'unit_price' => 1170000,
        ]);
    }
}
