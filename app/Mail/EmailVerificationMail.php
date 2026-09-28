<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class EmailVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $code,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your verification code for '.config('app.name', 'R&M Inventory System'));
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.auth.verification-code',
            text: 'emails.auth.verification-code-text',
        );
    }

    public function attachments(): array
    {
        return [];
    }
}
