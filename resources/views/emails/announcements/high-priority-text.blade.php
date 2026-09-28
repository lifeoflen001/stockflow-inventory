{{ config('app.name', 'StockFlow') }}

HIGH PRIORITY: {{ $announcement->title }}

@if($announcement->summary){{ $announcement->summary }}

@endif{{ $announcement->content }}

View announcement:
{{ $announcementUrl }}
