<?php

namespace App\Mail;

use App\Models\UserInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public UserInvitation $invitation,
        public string $invitationUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'You are invited to join '.($this->invitation->organization?->name ?? 'StockFlow'));
    }

    public function content(): Content
    {
        return new Content(view: 'emails.invitations.invitation', text: 'emails.invitations.invitation-text');
    }

    public function attachments(): array
    {
        return [];
    }
}
