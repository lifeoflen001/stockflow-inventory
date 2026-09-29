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

class EnsureSuperAdmin extends Command
{
    protected $signature = 'superadmin:ensure
        {--organization= : Organization ID or code}
        {--name= : Full name}
        {--email= : Email address}
        {--password= : Password}';

    protected $description = 'Ensure a verified super administrator exists using explicit options';

    public function handle(): int
    {
        $organizations = Organization::query()->orderBy('name')->get(['id', 'code', 'name']);
        if ($organizations->isEmpty()) {
            $this->error('No organization exists. Run the database seeder first.');
            return self::FAILURE;
        }

        $organization = $this->resolveOrganization($organizations);
        if (! $organization) return self::FAILURE;

        $name = trim((string) $this->option('name'));
        $email = Str::lower(trim((string) $this->option('email')));
        $password = (string) $this->option('password');
        $existing = User::query()->where('email', $email)->first();

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', Password::min(10)->letters()->numbers()],
        ];
        if ($existing) $rules['email'][] = 'in:'.$existing->email;
        else $rules['email'][] = 'unique:users,email';

        $validator = Validator::make(['name' => $name, 'email' => $email, 'password' => $password], $rules);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) $this->error($error);
            return self::FAILURE;
        }

        if ($existing) {
            $user = $existing;
            $user->forceFill([
                'organization_id' => $organization->id,
                'name' => $name,
                'is_active' => true,
                'email_verified_at' => $user->email_verified_at ?: now(),
            ])->save();
            $this->line("Super administrator already exists: {$email}");
        } else {
            $user = User::create([
                'organization_id' => $organization->id,
                'name' => $name,
                'email' => $email,
                'password' => Hash::make($password),
                'is_active' => true,
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();
            $this->info("Super administrator created for {$organization->name}: {$email}");
        }

        $role = Role::where('name', 'super_admin')->firstOrFail();
        $user->roles()->sync([$role->id => ['organization_id' => $organization->id]]);

        return self::SUCCESS;
    }

    private function resolveOrganization($organizations): ?Organization
    {
        $requested = trim((string) $this->option('organization'));
        if ($requested === '') return $organizations->first();

        $organization = $organizations->first(fn (Organization $item) =>
            (string) $item->id === $requested || $item->code === $requested
        );
        if (! $organization) $this->error('The requested organization was not found.');
        return $organization;
    }
}
