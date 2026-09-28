@component('emails.layouts.base', ['title' => 'You are invited to join '.($invitation->organization?->name ?? config('app.name', 'StockFlow')), 'preheader' => 'You have been invited to join your organization workspace.', 'accent' => '#40558f'])
    <div style="display:inline-block; padding:6px 10px; border-radius:4px; background:#14264a; color:#9dbafa; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;">Team invitation</div>
    <h1 style="margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2; letter-spacing:-.5px;">You are invited to join {{ $invitation->organization?->name ?? config('app.name', 'StockFlow') }}</h1>
    <p style="margin:0 0 24px; color:#9ba8ba; font-size:15px; line-height:1.7;">{{ $invitation->inviter?->name ?? 'An administrator' }} invited you to collaborate as a <strong style="color:#f7f9fc;">{{ $invitation->role?->label ?? 'team member' }}</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px; background:#0d1724; border:1px solid #30425f; border-radius:8px;">
        <tr>
            <td style="padding:16px 18px; color:#8090a7; font-size:12px;">INVITED EMAIL<br><strong style="display:inline-block; padding-top:4px; color:#f7f9fc; font-size:14px; font-weight:600;">{{ $invitation->email }}</strong></td>
            <td style="padding:16px 18px; text-align:right; color:#8090a7; font-size:12px;">EXPIRES<br><strong style="display:inline-block; padding-top:4px; color:#f7f9fc; font-size:14px; font-weight:600;">{{ $invitation->expires_at->toFormattedDateString() }}</strong></td>
        </tr>
    </table>
    <p style="margin:0; color:#c1cad6; font-size:15px; line-height:1.7;">Create your account and set a secure password to get started.</p>
    @include('emails.components.button', ['url' => $invitationUrl, 'label' => 'Accept invitation', 'color' => '#40558f'])
    <p style="margin:24px 0 8px; color:#8090a7; font-size:12px; line-height:1.6;">Or copy and paste this link into your browser:</p>
    <p style="margin:0; word-break:break-all; color:#8fb1ff; font-size:12px; line-height:1.6;">{{ $invitationUrl }}</p>
@endcomponent
