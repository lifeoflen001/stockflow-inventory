<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PettyCashComment;
use App\Models\PettyCashDocument;
use App\Models\PettyCashVoucher;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PettyCashController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $vouchers = PettyCashVoucher::query()
            ->where('organization_id', $request->user()->organization_id)
            ->with('issuedBy:id,name')
            ->latest('issued_at')
            ->latest('id')
            ->get()
            ->map(fn (PettyCashVoucher $voucher) => $this->payload($voucher));

        return response()->json($vouchers);
    }

    public function show(Request $request, PettyCashVoucher $pettyCash): JsonResponse
    {
        abort_unless((int) $pettyCash->organization_id === (int) $request->user()->organization_id, 404);
        return response()->json($this->payload($pettyCash->load(['issuedBy:id,name', 'documents.uploadedBy:id,name', 'comments.user:id,name'])));
    }

    public function uploadDocument(Request $request, PettyCashVoucher $pettyCash): JsonResponse
    {
        $this->assertOwned($request, $pettyCash);
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'file' => ['required', 'file', 'max:20480', 'mimes:jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt'],
        ]);

        $file = $request->file('file');
        $path = $file->store('petty-cash/' . $pettyCash->organization_id . '/' . $pettyCash->id, 'local');
        $document = $pettyCash->documents()->create([
            'uploaded_by' => $request->user()->id,
            'title' => filled($data['title'] ?? null) ? trim($data['title']) : pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_name' => $file->getClientOriginalName(),
            'disk' => 'local',
            'path' => $path,
            'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
            'size' => $file->getSize() ?: 0,
        ]);

        return response()->json($this->documentPayload($document->load('uploadedBy:id,name')), 201);
    }

    public function downloadDocument(Request $request, PettyCashVoucher $pettyCash, PettyCashDocument $document)
    {
        $this->assertOwned($request, $pettyCash);
        abort_unless((int) $document->petty_cash_voucher_id === (int) $pettyCash->id, 404);
        abort_unless(Storage::disk($document->disk)->exists($document->path), 404);

        return Storage::disk($document->disk)->download($document->path, $document->original_name, ['Content-Type' => $document->mime_type]);
    }

    public function destroyDocument(Request $request, PettyCashVoucher $pettyCash, PettyCashDocument $document): JsonResponse
    {
        $this->assertOwned($request, $pettyCash);
        abort_unless((int) $document->petty_cash_voucher_id === (int) $pettyCash->id, 404);
        Storage::disk($document->disk)->delete($document->path);
        $document->delete();

        return response()->json(['message' => 'Document removed']);
    }

    public function storeComment(Request $request, PettyCashVoucher $pettyCash): JsonResponse
    {
        $this->assertOwned($request, $pettyCash);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $comment = $pettyCash->comments()->create(['user_id' => $request->user()->id, 'body' => trim($data['body'])]);

        return response()->json($this->commentPayload($comment->load('user:id,name')), 201);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $request->user()->organization;
        $data = $request->validate([
            'issuedAt' => ['required', 'date'],
            'collector' => ['required', 'string', 'max:255'],
            'requiredFor' => ['required', 'string', 'max:2000'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $date = Carbon::parse($data['issuedAt']);
        $prefix = 'PC-' . $date->format('Ymd') . '-';
        $sequence = PettyCashVoucher::where('organization_id', $organization->id)
            ->where('voucher_number', 'like', $prefix . '%')
            ->count() + 1;
        do {
            $voucherNumber = $prefix . str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while (PettyCashVoucher::where('organization_id', $organization->id)->where('voucher_number', $voucherNumber)->exists());

        $voucher = PettyCashVoucher::create([
            'organization_id' => $organization->id,
            'issued_by' => $request->user()->id,
            'voucher_number' => $voucherNumber,
            'issued_at' => $date->toDateString(),
            'collector' => trim($data['collector']),
            'required_for' => trim($data['requiredFor']),
            'amount' => $data['amount'],
            'currency' => $organization->currency ?: 'TSHS',
            'notes' => filled($data['notes'] ?? null) ? trim($data['notes']) : null,
        ])->load('issuedBy:id,name');

        return response()->json($this->payload($voucher), 201);
    }

    private function payload(PettyCashVoucher $voucher): array
    {
        return [
            'id' => (string) $voucher->id,
            'voucherNumber' => $voucher->voucher_number,
            'issuedAt' => $voucher->issued_at?->toDateString(),
            'collector' => $voucher->collector,
            'requiredFor' => $voucher->required_for,
            'amount' => (float) $voucher->amount,
            'currency' => $voucher->currency,
            'notes' => $voucher->notes,
            'issuedBy' => $voucher->issuedBy ? ['id' => (string) $voucher->issuedBy->id, 'name' => $voucher->issuedBy->name] : null,
            'documents' => $voucher->relationLoaded('documents') ? $voucher->documents->map(fn (PettyCashDocument $document) => $this->documentPayload($document))->values() : [],
            'comments' => $voucher->relationLoaded('comments') ? $voucher->comments->map(fn (PettyCashComment $comment) => $this->commentPayload($comment))->values() : [],
        ];
    }

    private function assertOwned(Request $request, PettyCashVoucher $pettyCash): void
    {
        abort_unless((int) $pettyCash->organization_id === (int) $request->user()->organization_id, 404);
    }

    private function documentPayload(PettyCashDocument $document): array
    {
        return [
            'id' => (string) $document->id,
            'title' => $document->title,
            'name' => $document->original_name,
            'mimeType' => $document->mime_type,
            'size' => (int) $document->size,
            'createdAt' => $document->created_at?->toIso8601String(),
            'uploadedBy' => $document->uploadedBy?->name,
            'downloadPath' => '/petty-cash/' . $document->petty_cash_voucher_id . '/documents/' . $document->id . '/download',
        ];
    }

    private function commentPayload(PettyCashComment $comment): array
    {
        return [
            'id' => (string) $comment->id,
            'body' => $comment->body,
            'createdAt' => $comment->created_at?->toIso8601String(),
            'user' => $comment->user ? ['id' => (string) $comment->user->id, 'name' => $comment->user->name] : null,
        ];
    }
}
