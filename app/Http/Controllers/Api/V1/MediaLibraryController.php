<?php
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\MediaFolder;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaLibraryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $org = $request->user()->organization_id;
        $query = MediaAsset::where('organization_id', $org)->when($request->integer('folder_id'), fn ($q, $id) => $q->where('folder_id', $id))->when($request->string('search')->toString(), fn ($q, $search) => $q->where('original_name', 'like', '%'.$search.'%'));
        $totalSize = (clone $query)->sum('size'); $imageCount = (clone $query)->where('mime_type', 'like', 'image/%')->count();
        $assets = $query->orderBy($request->string('sort')->toString() === 'name' ? 'original_name' : 'created_at', $request->string('direction')->toString() === 'asc' ? 'asc' : 'desc')->paginate(min($request->integer('per_page', 18), 60));
        $assets->through(fn (MediaAsset $asset) => $this->payload($asset));
        $folders = MediaFolder::where('organization_id', $org)->withCount('assets')->orderBy('name')->get();
        $stats = MediaAsset::where('organization_id', $org)
            ->selectRaw('COUNT(*) as files, COALESCE(SUM(size), 0) as total_size, SUM(CASE WHEN mime_type LIKE ? THEN 1 ELSE 0 END) as images', ['image/%'])
            ->first();
        return ApiResponse::success(['assets' => $assets, 'folders' => $folders, 'stats' => ['files' => (int) ($stats?->files ?? 0), 'size' => (int) ($stats?->total_size ?? 0), 'images' => (int) ($stats?->images ?? 0), 'filtered_size' => $totalSize, 'filtered_images' => $imageCount]]);
    }

    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate(['files' => ['required', 'array', 'max:20'], 'files.*' => ['required', 'file', 'max:25600', 'mimes:jpg,jpeg,png,webp,gif,pdf,doc,docx,xls,xlsx,csv,txt,zip'], 'folder_id' => ['nullable', 'integer']]);
        $org = $request->user()->organization_id;
        if (! empty($data['folder_id'])) abort_unless(MediaFolder::where('organization_id', $org)->whereKey($data['folder_id'])->exists(), 422);
        $created = [];
        foreach ($request->file('files') as $file) { $original = $file->getClientOriginalName(); $path = $file->storeAs('media/'.$org.'/'.now()->format('Y/m'), Str::uuid().'.'.$file->getClientOriginalExtension(), 'public'); $asset = MediaAsset::create(['organization_id' => $org, 'folder_id' => $data['folder_id'] ?? null, 'uploaded_by' => $request->user()->id, 'name' => pathinfo($original, PATHINFO_FILENAME), 'original_name' => $original, 'disk' => 'public', 'path' => $path, 'mime_type' => $file->getMimeType() ?: 'application/octet-stream', 'extension' => strtolower($file->getClientOriginalExtension()), 'size' => $file->getSize()]); $created[] = $this->payload($asset); }
        return ApiResponse::success($created, 201);
    }

    public function createFolder(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        return ApiResponse::success(MediaFolder::firstOrCreate(['organization_id' => $request->user()->organization_id, 'name' => trim($data['name'])]), 201);
    }

    public function destroy(Request $request, MediaAsset $asset): JsonResponse
    {
        abort_unless($asset->organization_id === $request->user()->organization_id, 404); Storage::disk($asset->disk)->delete($asset->path); $asset->delete(); return response()->json(null, 204);
    }

    private function payload(MediaAsset $asset): array { return ['id' => $asset->id, 'folderId' => $asset->folder_id, 'name' => $asset->original_name, 'mimeType' => $asset->mime_type, 'extension' => strtoupper($asset->extension ?? ''), 'size' => $asset->size, 'url' => $asset->disk === 'public' ? '/storage/'.$asset->path : Storage::disk($asset->disk)->url($asset->path), 'createdAt' => $asset->created_at]; }
}
