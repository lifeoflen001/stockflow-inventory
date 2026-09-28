@php
    $brandName = $brandName ?? config('app.name', 'StockFlow');
    $brandLogoUrl = config('app.brand_logo_url');
    $accent = $accent ?? '#40558f';
    $title = $title ?? $brandName;
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        h1 { margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2; letter-spacing:-.5px; }
        p { color:#9ba8ba; font-size:15px; line-height:1.7; }
    </style>
</head>
<body style="margin:0; padding:0; background:#03070d; color:#f7f9fc; font-family:'Plus Jakarta Sans','Inter',Arial,Helvetica,sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">{{ $preheader ?? $title }}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#03070d; padding:32px 12px; font-family:'Plus Jakarta Sans','Inter',Arial,Helvetica,sans-serif;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
                    <tr>
                        <td align="center" style="padding:0 0 22px;">
                            @if($brandLogoUrl)
                                <img src="{{ $brandLogoUrl }}" alt="{{ $brandName }}" width="220" style="display:block; width:220px; max-width:90%; height:auto; border:0;">
                            @else
                                <div style="color:{{ $accent }}; font-size:22px; font-weight:800; letter-spacing:-.3px;">{{ $brandName }}</div>
                            @endif
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#080c12; border:1px solid #2b3748; border-top:2px solid {{ $accent }}; border-radius:9px; padding:40px 42px; box-shadow:0 28px 60px rgba(0,0,0,.42); font-family:'Plus Jakarta Sans','Inter',Arial,Helvetica,sans-serif;">
                            {{ $slot }}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:22px 18px 0; color:#8090a7; font-size:12px; line-height:1.6; font-family:'Plus Jakarta Sans','Inter',Arial,Helvetica,sans-serif;">
                            This is an automated message from {{ $brandName }}. Please do not reply.<br>
                            &copy; {{ now()->year }} {{ $brandName }}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
