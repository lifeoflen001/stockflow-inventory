{{ config('app.name', 'StockFlow') }}

Reset your password

Hi {{ $user->name }},

Use this secure link to reset your password:
{{ $resetUrl }}

The link expires in 60 minutes. If you did not request a password reset, no action is needed.
