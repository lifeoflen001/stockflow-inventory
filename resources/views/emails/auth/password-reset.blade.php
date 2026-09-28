@component('emails.layouts.base', ['title' => 'Reset your password', 'preheader' => 'Use this secure link to reset your password.', 'accent' => '#40558f'])
    <div style="display:inline-block; padding:6px 10px; border-radius:4px; background:#14264a; color:#9dbafa; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;">Account security</div>
    <h1 style="margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2; letter-spacing:-.5px;">Reset your password</h1>
    <p style="margin:0 0 22px; color:#9ba8ba; font-size:15px; line-height:1.7;">Hi {{ $user->name }}, we received a request to set a new password for your account.</p>
    @include('emails.components.button', ['url' => $resetUrl, 'label' => 'Reset password', 'color' => '#40558f'])
    <p style="margin:24px 0 8px; color:#8090a7; font-size:12px; line-height:1.6;">This link expires in 60 minutes. If you did not request a password reset, no action is needed.</p>
    <p style="margin:0; word-break:break-all; color:#8fb1ff; font-size:12px; line-height:1.6;">{{ $resetUrl }}</p>
@endcomponent
