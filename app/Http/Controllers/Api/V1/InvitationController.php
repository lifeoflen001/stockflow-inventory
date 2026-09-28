<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\InvitationMail;
use App\Models\{Organization, Supplier};
use App\Models\Role;
use App\Models\User;
use App\Models\UserInvitation;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use App\Services\EmailVerificationService;
use App\Services\MailDeliveryService;
use RuntimeException;
use Throwable;

class InvitationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(UserInvitation::where('organization_id', $request->user()->organization_id)
            ->with(['role:id,name,label', 'inviter:id,name', 'supplier:id,name'])->latest()->get());
    }

    public function store(Request $request, MailDeliveryService $delivery): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'role_id' => ['required', 'integer', 'exists:roles,id'], 'department_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('departments', 'id')->where('organization_id', $request->user()->organization_id)], 'supplier_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('suppliers', 'id')->where('organization_id', $request->user()->organization_id)->where('is_active', true)]]);
        $email = Str::lower($data['email']);
        if (User::where('email', $email)->exists()) {
            return ApiResponse::error('This user already belongs to your organization.', 422, ['email' => ['The email is already in use.']]);
        }
        abort_unless($request->user()->hasPermission('roles.assign'), 403, 'You are not authorized to assign roles.');
        $role = Role::findOrFail($data['role_id']);
        if ($role->name === 'supplier') abort_unless(! empty($data['supplier_id']), 422, 'Select the supplier company for this invitation.');
        if ($role->name !== 'supplier') $data['supplier_id'] = null;
        abort_if($role->name === 'super_admin' && $request->user()->primaryRole() !== 'super_admin', 403, 'Only a super administrator can invite another super administrator.');
        $plainToken = Str::random(64);
        $alreadySent = false;
        $invite = DB::transaction(function () use ($request, $data, $email, $plainToken, &$alreadySent) {
            Organization::query()->whereKey($request->user()->organization_id)->lockForUpdate()->firstOrFail();
            $existing = UserInvitation::query()
                ->where('organization_id', $request->user()->organization_id)
                ->where('email', $email)
                ->whereNull('accepted_at')
                ->whereNull('revoked_at')
                ->lockForUpdate()
                ->first();

            if ($existing && $existing->expires_at->isFuture() && $existing->created_at->isAfter(now()->subMinute())) {
                if ((int) $existing->role_id === (int) $data['role_id']) {
                    $alreadySent = true;
                    return $existing;
                }

                throw ValidationException::withMessages(['email' => ['An active invitation already exists for this email. Revoke it before choosing a different role.']]);
            }

            $existing?->update(['revoked_at' => now()]);

            return UserInvitation::create([
                'organization_id' => $request->user()->organization_id,
                'role_id' => $data['role_id'],
                'department_id' => $data['department_id'] ?? null,
                'supplier_id' => $data['supplier_id'] ?? null,
                'invited_by' => $request->user()->id,
                'email' => $email,
                'token_hash' => hash('sha256', $plainToken),
                'expires_at' => now()->addDays(7),
            ]);
        });

        $invite->load(['role', 'inviter', 'organization']);
        $frontend = rtrim((string) config('app.frontend_url', 'http://localhost:5173'), '/');
        $url = $frontend.'/accept-invitation?token='.urlencode($plainToken);
        if (! $alreadySent) {
            try {
                $delivery->send($invite->organization, $invite->email, $invite->email, new InvitationMail($invite, $url));
            } catch (Throwable $exception) {
                report($exception);
                // Do not leave a failed delivery looking like a valid invitation.
                // Otherwise an immediate retry is incorrectly treated as a duplicate
                // and no new email is sent.
                $invite->update(['revoked_at' => now()]);
                return ApiResponse::error('The invitation email could not be sent. Check Email Settings and try again.', 503);
            }
        }

        return ApiResponse::success([
            'invitation' => $invite,
            'token' => $alreadySent ? null : $plainToken,
            'message' => $alreadySent ? 'The invitation email was already sent.' : 'Invitation email sent.',
        ], $alreadySent ? 200 : 201);
    }

    public function revoke(Request $request, UserInvitation $invitation): JsonResponse
    {
        abort_unless($invitation->organization_id === $request->user()->organization_id, 404);
        $invitation->update(['revoked_at' => now()]);
        return ApiResponse::success($invitation);
    }

    public function accept(Request $request, EmailVerificationService $verification): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string'], 'name' => ['required', 'string', 'max:255'], 'password' => ['required', 'string', 'min:10', 'confirmed']]);
        $invite = UserInvitation::with('role')->where('token_hash', hash('sha256', $data['token']))->first();
        if (! $invite || $invite->accepted_at || $invite->revoked_at || $invite->expires_at->isPast()) return ApiResponse::error('This invitation is invalid or has expired.', 422);
        $user = DB::transaction(function () use ($invite, $data) {
            $user = User::create(['organization_id' => $invite->organization_id, 'department_id' => $invite->department_id, 'supplier_id' => $invite->supplier_id, 'name' => $data['name'], 'email' => $invite->email, 'password' => $data['password'], 'is_active' => true]);
            $user->roles()->attach($invite->role_id, ['organization_id' => $invite->organization_id]);
            $invite->update(['accepted_at' => now()]);
            return $user;
        });
        $deliveryWarning = null;
        try {
            $verification->send($user);
        } catch (RuntimeException $exception) {
            report($exception);
            $deliveryWarning = 'Your account was created, but the verification email could not be sent. Use Resend code after checking the email settings.';
        }

        return ApiResponse::success([
            'message' => $deliveryWarning ?? 'Invitation accepted. Verify your email to continue.',
            'email' => $user->email,
            'deliveryWarning' => $deliveryWarning,
        ]);
    }
}
