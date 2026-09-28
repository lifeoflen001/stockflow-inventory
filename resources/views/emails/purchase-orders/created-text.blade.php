New purchase order {{ $purchaseOrder->po_number }} has been created for {{ $purchaseOrder->supplier?->name ?? 'your company' }}.

Status: {{ str($purchaseOrder->status)->replace('_', ' ')->title() }}
Orders awaiting internal manager approval will appear in your supplier portal after approval.

Open supplier portal: {{ $portalUrl }}
