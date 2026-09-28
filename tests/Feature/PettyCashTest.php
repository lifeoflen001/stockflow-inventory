<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PettyCashTest extends TestCase
{
    use RefreshDatabase;

    public function test_authorized_user_can_issue_petty_cash(): void
    {
        $this->seed();
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => $admin->email,
            'password' => 'StockFlow@2026!',
        ])->json('token');

        $this->postJson('/api/v1/petty-cash', [
            'issuedAt' => '2026-08-17',
            'collector' => 'Operations Desk',
            'requiredFor' => 'Local transport',
            'amount' => 50000,
            'notes' => 'Test voucher',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('voucherNumber', 'PC-20260817-0001')
            ->assertJsonPath('issuedAt', '2026-08-17');
    }
}
