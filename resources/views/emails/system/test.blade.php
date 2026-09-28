@component('emails.layouts.base', ['title' => 'Email delivery test', 'preheader' => 'Your outbound email configuration is working.', 'accent' => '#40558f'])
    <div style="display:inline-block; padding:6px 10px; border-radius:4px; background:#14264a; color:#9dbafa; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;">Delivery check</div>
    <h1 style="margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2;">Email delivery is working</h1>
    <p style="margin:0 0 22px; color:#9ba8ba; font-size:15px; line-height:1.7;">Hi {{ $recipientName }}, this test confirms that StockFlow can send email using the saved outbound configuration.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d1724; border:1px solid #30425f; border-radius:8px;">
        <tr><td style="padding:18px; color:#c1cad6; font-size:14px; line-height:1.7;"><strong>Next step:</strong> request a verification code or password reset to confirm the complete user flow.</td></tr>
    </table>
@endcomponent
