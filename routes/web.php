<?php

use Illuminate\Support\Facades\Route;

Route::fallback(function () {
    $index = public_path('app/index.html');

    if (!is_file($index)) {
        return view('welcome');
    }

    return response()->file($index);
});
