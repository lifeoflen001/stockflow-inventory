<?php

namespace App\Mail;

use App\Models\AppNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OperationalNotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public AppNotification $notification) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: '['.strtoupper((string) $this->notification->severity).'] '.$this->notification->title);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.operational-notification');
    }

    public function attachments(): array { return []; }
}
