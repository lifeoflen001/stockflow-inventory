<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class TestEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $recipientName) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Email delivery test - '.config('app.name', 'StockFlow'));
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.system.test',
            text: 'emails.system.test-text',
        );
    }

    public function attachments(): array
    {
        return [];
    }
}
