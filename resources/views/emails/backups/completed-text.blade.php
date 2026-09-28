Database backup completed

The backup for {{ $organization->name }} completed successfully.

File: {{ $backup->filename }}
Size: {{ number_format($backup->size / 1048576, 2) }} MB
Includes uploads: {{ $backup->includes_uploads ? 'Yes' : 'No' }}

The ZIP archive is attached to this email.
