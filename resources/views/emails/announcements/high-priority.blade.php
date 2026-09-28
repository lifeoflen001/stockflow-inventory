@component('emails.layouts.base', ['title' => $announcement->title, 'preheader' => 'A high-priority announcement needs your attention.', 'accent' => '#40558f'])
    <div style="display:inline-block; padding:6px 10px; border-radius:4px; background:#14264a; color:#9dbafa; font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;">High priority</div>
    <h1 style="margin:18px 0 10px; color:#f7f9fc; font-size:28px; line-height:1.2;">{{ $announcement->title }}</h1>
    @if($announcement->summary)<p style="margin:0 0 22px; color:#9ba8ba; font-size:15px; line-height:1.7;">{{ $announcement->summary }}</p>@endif
    <div style="border-left:2px solid #4f7fe4; padding:4px 0 4px 16px; color:#c1cad6; font-size:15px; line-height:1.8;">{!! nl2br(e($announcement->content)) !!}</div>
    @include('emails.components.button', ['url' => $announcementUrl, 'label' => 'View announcement', 'color' => '#40558f'])
@endcomponent
