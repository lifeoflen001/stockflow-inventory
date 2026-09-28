<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $resetUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reset your '.config('app.name', 'StockFlow').' password');
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.auth.password-reset',
            text: 'emails.auth.password-reset-text',
        );
    }

    public function attachments(): array
    {
        return [];
    }
}
