@component('emails.layouts.base', ['title' => 'Database backup completed'])
    <h1>Database backup completed</h1>
    <p style="margin:0 0 16px;">Hello,</p>
    <p style="margin:0 0 16px;">The backup for <strong style="color:#17213d;">{{ $organization->name }}</strong> completed successfully.</p>
    <p style="margin:0 0 16px;">The ZIP archive is attached to this email.</p>
    <p style="margin:0;"><strong style="color:#17213d;">File:</strong> {{ $backup->filename }}<br>
        <strong>Size:</strong> {{ number_format($backup->size / 1048576, 2) }} MB<br>
        <strong>Includes uploads:</strong> {{ $backup->includes_uploads ? 'Yes' : 'No' }}</p>
@endcomponent
