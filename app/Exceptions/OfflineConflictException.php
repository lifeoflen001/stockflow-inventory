<?php

namespace App\Exceptions;

use RuntimeException;

class OfflineConflictException extends RuntimeException
{
    public function __construct(string $message, public array $context = [])
    {
        parent::__construct($message);
    }
}
