<?php

namespace App\Mail;

use App\Models\Announcement;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class HighPriorityAnnouncementMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Announcement $announcement,
        public string $announcementUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'High priority announcement: '.$this->announcement->title);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.announcements.high-priority', text: 'emails.announcements.high-priority-text');
    }

    public function attachments(): array
    {
        return [];
    }
}
