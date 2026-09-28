<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Policy;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PolicyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organizationId = (int) $request->user()->organization_id;
        $existing = Policy::where('organization_id', $organizationId)->get()->keyBy('slug');

        foreach (Policy::definitions() as $definition) {
            if (! $existing->has($definition['slug'])) {
                Policy::create([...$definition, 'organization_id' => $organizationId, 'is_published' => true]);
            }
        }

        $query = Policy::where('organization_id', $organizationId);
        if ($request->user()->primaryRole() !== 'super_admin') {
            $query->where('is_published', true);
        }

        $policies = $query
            ->with('updater:id,name')
            ->orderBy('id')
            ->get()
            ->map(fn (Policy $policy): array => $this->payload($policy))
            ->values();

        return ApiResponse::success($policies);
    }

    public function update(Request $request, string $slug): JsonResponse
    {
        abort_unless($request->user()->primaryRole() === 'super_admin', 403, 'Only a super administrator can edit policies.');

        $definition = collect(Policy::definitions())->firstWhere('slug', $slug);
        abort_unless($definition, 404);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'summary' => ['nullable', 'string', 'max:500'],
            'content' => ['required', 'string', 'max:100000'],
            'is_published' => ['sometimes', 'boolean'],
        ]);

        $policy = Policy::firstOrCreate(
            ['organization_id' => $request->user()->organization_id, 'slug' => $slug],
            ['title' => $definition['title'], 'summary' => $definition['summary'], 'content' => $definition['content'], 'is_published' => true]
        );
        $policy->fill($data);
        $policy->organization_id = $request->user()->organization_id;
        $policy->updated_by = $request->user()->id;
        $policy->save();

        return ApiResponse::success($this->payload($policy->fresh()->load('updater:id,name')));
    }

    private function payload(Policy $policy): array
    {
        return [
            'slug' => $policy->slug,
            'title' => $policy->title,
            'summary' => $policy->summary,
            'content' => $policy->content,
            'isPublished' => (bool) $policy->is_published,
            'updatedAt' => $policy->updated_at?->toIso8601String(),
            'updatedBy' => $policy->updater?->name,
        ];
    }
}
