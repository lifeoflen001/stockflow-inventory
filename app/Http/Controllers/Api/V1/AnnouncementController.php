<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Mail\HighPriorityAnnouncementMail;
use App\Models\{Announcement, User};
use App\Support\ApiResponse;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use App\Services\{MailDeliveryService, OrganizationSettingsService};
use App\Services\NotificationService;

class AnnouncementController extends Controller {
    public function index(Request $request): JsonResponse {
        $query = Announcement::where('organization_id', $request->user()->organization_id)->with(['creator:id,name','branches:id,name','departments:id,name','recipients:id,name'])->withCount('viewers')->latest('starts_at');
        return ApiResponse::success($query->get());
    }
    public function store(Request $request, MailDeliveryService $delivery, NotificationService $notifications): JsonResponse { return $this->save($request, new Announcement, $delivery, $notifications); }
    public function show(Request $request, Announcement $announcement): JsonResponse {
        $this->ownedOrganization($request, $announcement); DB::table('announcement_views')->upsert([['announcement_id'=>$announcement->id,'user_id'=>$request->user()->id,'viewed_at'=>now()]], ['announcement_id','user_id'], []);
        $announcement->load(['creator:id,name','branches:id,name','departments:id,name','recipients:id,name'])->loadCount('viewers');
        $eligible = $announcement->company_wide ? User::where('organization_id', $announcement->organization_id)->count() : $announcement->recipients()->count();
        return ApiResponse::success(['announcement'=>$announcement,'statistics'=>['views'=>$announcement->viewers_count,'eligible'=>$eligible]]);
    }
    public function update(Request $request, Announcement $announcement, MailDeliveryService $delivery, NotificationService $notifications): JsonResponse { $this->canManage($request, $announcement); return $this->save($request, $announcement, $delivery, $notifications); }
    public function destroy(Request $request, Announcement $announcement): JsonResponse { $this->canManage($request, $announcement); $announcement->delete(); return ApiResponse::success(['deleted'=>true]); }
    private function save(Request $request, Announcement $announcement, MailDeliveryService $delivery, NotificationService $notifications): JsonResponse {
        $wasHighPriority = $announcement->exists && $announcement->getOriginal('priority') === 'high';
        $data = $request->validate(['title'=>['required','string','max:255'],'summary'=>['nullable','string','max:500'],'content'=>['required','string'],'category'=>['required','string','max:100'],'priority'=>['required',Rule::in(['normal','high'])],'is_featured'=>['boolean'],'company_wide'=>['boolean'],'starts_at'=>['required','date'],'ends_at'=>['nullable','date','after_or_equal:starts_at'],'branch_ids'=>['array'],'branch_ids.*'=>['integer',Rule::exists('branches','id')->where('organization_id',$request->user()->organization_id)],'department_ids'=>['array'],'department_ids.*'=>['integer',Rule::exists('departments','id')->where('organization_id',$request->user()->organization_id)],'user_ids'=>['array'],'user_ids.*'=>['integer',Rule::exists('users','id')->where('organization_id',$request->user()->organization_id)]]);
        $announcement->fill(collect($data)->except(['branch_ids','department_ids','user_ids'])->all()); $announcement->organization_id=$request->user()->organization_id; if (!$announcement->exists) $announcement->created_by=$request->user()->id; $announcement->save();
        $announcement->branches()->sync($data['branch_ids']??[]); $announcement->departments()->sync($data['department_ids']??[]); $announcement->recipients()->sync($data['user_ids']??[]);
        if ($announcement->wasRecentlyCreated) $notifications->notifyAnnouncement($announcement);
        if ($announcement->priority === 'high' && ! $wasHighPriority) $this->notifyHighPriorityUsers($announcement, $delivery);
        return ApiResponse::success($announcement->load(['creator:id,name','branches:id,name','departments:id,name','recipients:id,name'])->loadCount('viewers'), $announcement->wasRecentlyCreated?201:200);
    }
    private function notifyHighPriorityUsers(Announcement $announcement, MailDeliveryService $delivery): void {
        $announcement->loadMissing('organization');
        if (! app(OrganizationSettingsService::class)->enabled($announcement->organization, 'email_notifications')) return;
        $frontend = rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/');
        $url = $frontend.'/announcements/'.$announcement->id;
        User::where('organization_id', $announcement->organization_id)->where('is_active', true)->whereNotNull('email')->orderBy('id')->each(function (User $user) use ($announcement, $url, $delivery): void {
            try { $delivery->send($announcement->organization, $user->email, $user->name, new HighPriorityAnnouncementMail($announcement, $url)); } catch (\Throwable $exception) { report($exception); }
        });
    }
    private function ownedOrganization(Request $request, Announcement $announcement): void { abort_unless($announcement->organization_id === $request->user()->organization_id, 404); }
    private function canManage(Request $request, Announcement $announcement): void { $this->ownedOrganization($request,$announcement); abort_unless($announcement->created_by === $request->user()->id || $request->user()->hasPermission('announcements.manage'), 403); }
}
