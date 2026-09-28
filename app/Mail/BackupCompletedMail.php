<?php

namespace App\Mail;

use App\Models\Organization;
use App\Models\SystemBackup;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class BackupCompletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public SystemBackup $backup,
        public Organization $organization,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Database backup completed - '.$this->organization->name);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.backups.completed', text: 'emails.backups.completed-text');
    }

    public function attachments(): array
    {
        return [
            Attachment::fromPath(Storage::disk($this->backup->disk)->path($this->backup->path))
                ->as($this->backup->filename)
                ->withMime('application/zip'),
        ];
    }
}
