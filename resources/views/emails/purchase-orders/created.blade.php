@extends('emails.layouts.base')

@section('content')
<h1>New purchase order</h1>
<p>Hello,</p>
<p>{{ $purchaseOrder->po_number }} has been created for {{ $purchaseOrder->supplier?->name ?? 'your company' }}.</p>
<p>The order is currently <strong>{{ str($purchaseOrder->status)->replace('_', ' ')->title() }}</strong>. Orders awaiting internal manager approval will appear in your portal after approval.</p>
<p><a href="{{ $portalUrl }}">Open supplier portal</a></p>
@endsection
