@component('emails.layouts.base', ['title' => 'Confirm your email address', 'preheader' => 'Your six-digit verification code is ready.', 'accent' => '#40558f'])
    <div style="display:inline-block; padding:6px 10px; border-radius:4px; background:#14264a; color:#9dbafa; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;">Email verification</div>
    <h1 style="margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2; letter-spacing:-.5px;">Confirm your email address</h1>
    <p style="margin:0 0 24px; color:#9ba8ba; font-size:15px; line-height:1.7;">Hi {{ $user->name }}, enter the code below to finish setting up your account.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px; background:#0d1724; border:1px solid #30425f; border-radius:8px;">
        <tr>
            <td align="center" style="padding:24px 18px 22px;">
                <div style="color:#8090a7; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;">Your six-digit code</div>
                <div style="padding-top:10px; color:#f7f9fc; font-size:36px; font-weight:800; letter-spacing:9px;">{{ $code }}</div>
            </td>
        </tr>
    </table>
    <p style="margin:0 0 8px; color:#c1cad6; font-size:14px; line-height:1.7;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
    <p style="margin:0; color:#8090a7; font-size:12px; line-height:1.6;">If you did not create this account, you can safely ignore this email.</p>
@endcomponent
