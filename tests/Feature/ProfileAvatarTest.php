<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileAvatarTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_avatar_can_be_uploaded_with_a_multipart_profile_update(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@stockflow.local',
            'password' => 'StockFlow@2026!',
        ])->assertOk()->json('token');

        $response = $this->withToken($token)->post('/api/v1/account/profile', [
            '_method' => 'PATCH',
            'name' => 'System Administrator',
            'email' => 'admin@stockflow.local',
            'phone' => '',
            'avatar' => UploadedFile::fake()->createWithContent(
                'profile.png',
                base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true) ?: '',
            ),
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'System Administrator');
        $path = User::where('email', 'admin@stockflow.local')->value('avatar_path');
        $this->assertNotEmpty($path);
        Storage::disk('public')->assertExists($path);
    }
}
