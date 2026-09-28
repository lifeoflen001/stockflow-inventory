<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Str;

class CreateSuperAdmin extends Command
{
    protected $signature = 'superadmin:create {--organization= : Organization ID or code}';
    protected $description = 'Interactively create a verified super administrator account';

    public function handle(): int
    {
        $organizations = Organization::query()->orderBy('name')->get(['id', 'code', 'name']);
        if ($organizations->isEmpty()) {
            $this->error('No organization exists. Run the database seeder first.');
            return self::FAILURE;
        }

        $organization = $this->resolveOrganization($organizations);
        if (! $organization) return self::FAILURE;

        $name = trim($this->ask('Full name'));
        $email = Str::lower(trim($this->ask('Email address')));
        $password = (string) $this->secret('Password');
        $confirmation = (string) $this->secret('Confirm password');

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password, 'password_confirmation' => $confirmation],
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
                'password' => ['required', 'confirmed', Password::min(10)->letters()->numbers()],
            ],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) $this->error($error);
            return self::FAILURE;
        }

        $user = User::create([
            'organization_id' => $organization->id,
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $role = Role::where('name', 'super_admin')->firstOrFail();
        $user->roles()->sync([$role->id => ['organization_id' => $organization->id]]);

        $this->info("Super administrator created for {$organization->name}: {$email}");
        return self::SUCCESS;
    }

    private function resolveOrganization($organizations): ?Organization
    {
        $requested = trim((string) $this->option('organization'));
        if ($requested !== '') {
            $organization = $organizations->first(fn (Organization $item) => (string) $item->id === $requested || $item->code === $requested);
            if (! $organization) $this->error('The requested organization was not found.');
            return $organization;
        }
        if ($organizations->count() === 1) return $organizations->first();

        $choice = $this->choice('Choose the organization', $organizations->mapWithKeys(fn (Organization $item) => [$item->id => "{$item->name} ({$item->code})"])->all());
        return $organizations->firstWhere('id', (int) $choice);
    }
}
