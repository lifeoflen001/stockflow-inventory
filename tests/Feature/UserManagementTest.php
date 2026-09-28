<?php

namespace Tests\Feature;

use App\Mail\InvitationMail;
use App\Models\Role;
use App\Models\Permission;
use App\Models\User;
use App\Services\MailDeliveryService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_superuser_can_manage_roles_users_and_invitations(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');

        $roles = $this->withToken($token)->getJson('/api/v1/roles')->assertOk();
        $storeKeeperId = collect($roles->json('data.roles'))->firstWhere('name', 'store_keeper')['id'];

        $invite = $this->withToken($token)->postJson('/api/v1/invitations', ['email' => 'keeper@example.com', 'role_id' => $storeKeeperId])
            ->assertCreated()->assertJsonPath('data.invitation.email', 'keeper@example.com');
        Mail::assertSent(InvitationMail::class, fn (InvitationMail $mail) => $mail->hasTo('keeper@example.com') && str_contains($mail->invitationUrl, '/accept-invitation?token=') && str_contains($mail->render(), 'Accept invitation'));
        $this->withToken($token)->postJson('/api/v1/invitations', ['email' => 'keeper@example.com', 'role_id' => $storeKeeperId])
            ->assertOk()->assertJsonPath('data.token', null)->assertJsonPath('data.message', 'The invitation email was already sent.');
        Mail::assertSentTimes(InvitationMail::class, 1);

        $this->postJson('/api/v1/invitations/accept', [
            'token' => $invite->json('data.token'), 'name' => 'Store Keeper',
            'password' => 'SecurePass123!', 'password_confirmation' => 'SecurePass123!',
        ])->assertOk();

        $users = $this->withToken($token)->getJson('/api/v1/users')->assertOk();
        $created = collect($users->json('data'))->firstWhere('email', 'keeper@example.com');
        $this->assertSame('store_keeper', $created['roles'][0]['name']);
        $this->assertContains('locations.view', $created['permissions']);
        $this->assertArrayHasKey('lastActiveAt', $created);
        $this->withToken($token)->patchJson('/api/v1/users/'.$created['id'], ['is_active' => false])
            ->assertOk()->assertJsonPath('data.isActive', false);
    }

    public function test_failed_invitation_delivery_is_revoked_and_can_be_retried(): void
    {
        $this->seed(DatabaseSeeder::class);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $storeKeeperId = collect($this->withToken($token)->getJson('/api/v1/roles')->json('data.roles'))->firstWhere('name', 'store_keeper')['id'];

        $delivery = $this->mock(MailDeliveryService::class);
        $delivery->shouldReceive('send')->once()->andThrow(new RuntimeException('SMTP unavailable'));

        $this->withToken($token)->postJson('/api/v1/invitations', ['email' => 'retry@example.com', 'role_id' => $storeKeeperId])
            ->assertStatus(503)
            ->assertJsonPath('message', 'The invitation email could not be sent. Check Email Settings and try again.');
        $this->assertDatabaseHas('user_invitations', ['email' => 'retry@example.com']);
        $this->assertNotNull(
            \App\Models\UserInvitation::where('email', 'retry@example.com')->value('revoked_at')
        );

        $this->app->forgetInstance(MailDeliveryService::class);
        Mail::fake();
        $retry = $this->withToken($token)->postJson('/api/v1/invitations', ['email' => 'retry@example.com', 'role_id' => $storeKeeperId])
            ->assertCreated()
            ->assertJsonPath('data.message', 'Invitation email sent.');

        $this->assertNotEmpty($retry->json('data.token'));
        Mail::assertSent(InvitationMail::class, fn (InvitationMail $mail) => $mail->hasTo('retry@example.com'));
    }

    public function test_invited_user_with_custom_role_can_sign_in_and_load_operations_dashboard(): void
    {
        Mail::fake();
        $this->seed(DatabaseSeeder::class);
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $role = Role::create(['name' => 'workshop_store_keeper', 'label' => 'Workshop Store Keeper']);
        $role->permissions()->sync(Permission::whereIn('name', ['locations.view', 'inventory.view', 'stock.issue', 'requisitions.create'])->pluck('id'));

        $invite = $this->withToken($adminToken)->postJson('/api/v1/invitations', ['email' => 'workshop@example.com', 'role_id' => $role->id])->assertCreated();
        $this->postJson('/api/v1/invitations/accept', [
            'token' => $invite->json('data.token'), 'name' => 'Workshop Store Keeper',
            'password' => 'SecurePass123!', 'password_confirmation' => 'SecurePass123!',
        ])->assertOk();
        $user = User::where('email', 'workshop@example.com')->firstOrFail();
        $user->forceFill(['email_verified_at' => now()])->save();

        $token = $this->postJson('/api/v1/auth/login', ['email' => 'workshop@example.com', 'password' => 'SecurePass123!'])
            ->assertOk()->assertJsonPath('user.role', 'workshop_store_keeper')->json('token');
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('role', 'workshop_store_keeper');
        $this->withToken($token)->getJson('/api/v1/dashboard/operations')->assertOk();
    }

    public function test_user_management_is_super_admin_only_and_keeps_one_active_super_admin(): void
    {
        $this->seed(DatabaseSeeder::class);
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();

        $this->withToken($adminToken)->patchJson('/api/v1/users/'.$admin->id, ['is_active' => false])
            ->assertStatus(422);
        $this->withToken($adminToken)->patchJson('/api/v1/users/'.$admin->id, ['role_id' => Role::where('name', 'store_keeper')->value('id')])
            ->assertStatus(422);

        $storeKeeper = User::factory()->create(['organization_id' => $admin->organization_id, 'email' => 'limited@example.com']);
        $storeKeeper->roles()->attach(Role::where('name', 'store_keeper')->value('id'), ['organization_id' => $admin->organization_id]);
        $limitedToken = $this->postJson('/api/v1/auth/login', ['email' => 'limited@example.com', 'password' => 'password'])->json('token');

        $this->withToken($limitedToken)->getJson('/api/v1/users')->assertForbidden();
        $users = $this->withToken($adminToken)->getJson('/api/v1/users')->assertOk();
        $this->assertCount(2, $users->json('data'));
        $this->assertSame(['admin@stockflow.local', 'limited@example.com'], collect($users->json('data'))->pluck('email')->sort()->values()->all());
    }

    public function test_super_admin_can_grant_and_revoke_user_permissions_without_changing_role(): void
    {
        $this->seed(DatabaseSeeder::class);
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => 'admin@stockflow.local', 'password' => 'StockFlow@2026!'])->json('token');
        $admin = User::where('email', 'admin@stockflow.local')->firstOrFail();
        $storeKeeperRole = Role::where('name', 'store_keeper')->firstOrFail();
        $inventoryView = Permission::where('name', 'inventory.view')->firstOrFail();
        $reportsView = Permission::where('name', 'reports.view')->firstOrFail();

        $user = User::factory()->create(['organization_id' => $admin->organization_id, 'email' => 'access@example.com']);
        $user->roles()->attach($storeKeeperRole->id, ['organization_id' => $admin->organization_id]);
        $userToken = $this->postJson('/api/v1/auth/login', ['email' => 'access@example.com', 'password' => 'password'])
            ->assertOk()->json('token');

        $this->withToken($adminToken)->patchJson('/api/v1/users/'.$user->id, [
            'permission_ids' => [$reportsView->id],
        ])->assertOk()
            ->assertJsonPath('data.role.name', 'store_keeper')
            ->assertJsonFragment(['name' => 'inventory.view', 'allowed' => false]);

        $user->refresh();
        $this->assertTrue($user->hasPermission('reports.view'));
        $this->assertFalse($user->hasPermission('inventory.view'));
        $this->withToken($userToken)->getJson('/api/v1/auth/me')->assertOk()->assertJsonFragment(['reports.view']);

        $this->withToken($adminToken)->patchJson('/api/v1/users/'.$user->id, [
            'permission_ids' => [$inventoryView->id, $reportsView->id],
        ])->assertOk();

        $user->refresh();
        $this->assertTrue($user->hasPermission('inventory.view'));
        $this->assertTrue($user->hasPermission('reports.view'));
        $this->assertDatabaseMissing('permission_user', ['user_id' => $user->id, 'permission_id' => $inventoryView->id]);
    }
}
