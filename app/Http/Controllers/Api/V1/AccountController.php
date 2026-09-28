<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($request->user()->id)],
            'current_password' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:40'],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:2048'],
            // Signatures are stored as PNG uploads. The file/mimes rules validate
            // the actual uploaded content while accepting transparent PNGs from
            // browsers that report a non-standard image MIME type.
            'signature' => ['nullable', 'file', 'mimes:png', 'max:1024'],
        ]);
        $user = $request->user();
        $email = mb_strtolower(trim($data['email']));
        if ($email !== mb_strtolower($user->email)) {
            abort_unless(! empty($data['current_password']) && Hash::check($data['current_password'], $user->password), 422, 'Your current password is required to change the email address.');
        }
        $user->fill(['name' => $data['name'], 'email' => $email, 'phone' => $data['phone'] ?? null]);
        if ($request->hasFile('avatar')) {
            if ($user->avatar_path) \Storage::disk('public')->delete($user->avatar_path);
            $user->avatar_path = $request->file('avatar')->store('avatars', 'public');
        }
        if ($request->hasFile('signature')) {
            if ($user->signature_path) \Storage::disk('public')->delete($user->signature_path);
            $user->signature_path = $request->file('signature')->store('signatures', 'public');
        }
        $user->save();
        return ApiResponse::success(['name' => $user->name, 'email' => $user->email, 'phone' => $user->phone, 'avatarUrl' => $user->avatar_path ? '/storage/'.$user->avatar_path : null, 'signatureUrl' => $user->signature_path ? '/storage/'.$user->signature_path : null]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', Password::min(10)->letters()->numbers()],
        ]);
        $user = $request->user();
        $user->update(['password' => Hash::make($data['password'])]);
        // A password change is a security boundary: require every device to
        // authenticate again with the new password.
        $user->apiTokens()->delete();
        return ApiResponse::success(['message' => 'Password changed successfully.']);
    }
}
