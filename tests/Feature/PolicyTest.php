<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_users_can_view_their_organization_policies(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)
            ->getJson('/api/v1/policies')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.slug', 'terms-of-service');
    }

    public function test_super_admin_can_update_a_policy(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $this->withToken($token)
            ->patchJson('/api/v1/policies/privacy-policy', ['title' => 'Privacy Notice', 'summary' => 'Updated summary', 'content' => '# Updated policy', 'is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.title', 'Privacy Notice')
            ->assertJsonPath('data.content', '# Updated policy');
    }

    public function test_non_super_admin_cannot_update_a_policy(): void
    {
        $this->seed(DatabaseSeeder::class);
        $organization = Organization::where('code', 'STOCKFLOW')->firstOrFail();
        $role = Role::where('name', 'accountant')->firstOrFail();
        $user = User::factory()->create(['organization_id' => $organization->id, 'email' => 'policy.viewer@stockflow.local', 'password' => 'PolicyViewer@2026!', 'is_active' => true]);
        $user->roles()->attach($role->id, ['organization_id' => $organization->id]);
        $token = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'PolicyViewer@2026!'])->json('token');

        $this->withToken($token)
            ->patchJson('/api/v1/policies/privacy-policy', ['title' => 'Should fail', 'content' => 'Should fail'])
            ->assertForbidden();
    }
}
