{{ config('app.name', 'StockFlow') }}

You are invited to join {{ $invitation->organization?->name ?? config('app.name', 'StockFlow') }}

{{ $invitation->inviter?->name ?? 'An administrator' }} invited you to join as {{ $invitation->role?->label ?? 'team member' }}.

Accept the invitation using this link:
{{ $invitationUrl }}

This invitation expires on {{ $invitation->expires_at->toFormattedDateString() }}.
