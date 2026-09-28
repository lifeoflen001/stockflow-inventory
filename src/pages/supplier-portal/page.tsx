import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { endpoints } from "@/api/endpoints.ts";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { generatePurchaseOrderPdf } from "@/lib/purchase-order-pdf.ts";
import { DocumentViewer, type DocumentViewerDocument } from "@/components/documents/document-viewer.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "@/lib/system-message.ts";
import { ClipboardList, Eye, FileText, Files, Loader2, PackageCheck } from "lucide-react";

function money(value: unknown) { return `TZS ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function statusLabel(value: unknown) { return String(value ?? "").replaceAll("_", " "); }

export default function SupplierPortalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const supplierView = user?.role === "supplier" && Boolean(user.supplier?.id);
  const orders = useApiQuery(endpoints.procurement.listPurchaseOrders) as any[] | undefined;
  const [previewDocument, setPreviewDocument] = useState<DocumentViewerDocument | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  if (orders === undefined) return <div className="space-y-5 p-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-[520px]" /></div>;

  const open = orders.filter((order) => ["draft", "sent", "confirmed", "partial"].includes(order.status));
  const total = orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
  const viewOrder = async (order: any) => {
    if (!order.approvedBy || order.status === "draft") {
      toast.error("The approved PO document will be available after manager approval.");
      return;
    }
    setPreviewBusy(order._id);
    try {
      const response = await apiClient.get(`/purchase-orders/${order._id}`);
      const blob = await generatePurchaseOrderPdf(response.data);
      const previewUrl = URL.createObjectURL(blob);
      setPreviewDocument({ name: `${order.poNumber}.pdf`, mimeType: "application/pdf", downloadPath: "", previewUrl });
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to open the purchase order document"));
    } finally {
      setPreviewBusy(null);
    }
  };
  const closePreview = (document: DocumentViewerDocument | null) => {
    if (!document && previewDocument?.previewUrl) URL.revokeObjectURL(previewDocument.previewUrl);
    if (!document) setPreviewDocument(null);
  };

  return <div className="space-y-5 p-6 pb-24 md:pb-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Supplier portal</p><h1 className="mt-1 text-2xl font-semibold">{supplierView ? "Your purchase orders" : "Supplier purchase orders"}</h1><p className="mt-1 text-sm text-muted-foreground">{supplierView ? "Orders for your company, including those awaiting the customer’s manager approval." : "Review purchase orders across your organization’s supplier network."}</p></div><div className="flex flex-wrap gap-2">{supplierView && <><Button variant="outline" onClick={() => navigate("/supplier-portal/catalog")}><PackageCheck className="size-4" />Products & prices</Button><Button variant="outline" onClick={() => navigate(`/suppliers/${user.supplier?.id}/documents`)}><Files className="size-4" />Partnership documents</Button></>}{!supplierView && <Button variant="outline" onClick={() => navigate("/suppliers")}><Files className="size-4" />Supplier directory</Button>}<Button variant="outline" onClick={() => navigate("/")}><PackageCheck className="size-4" />Dashboard</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Summary icon={<ClipboardList />} label="Total orders" value={orders.length} /><Summary icon={<PackageCheck />} label="Open orders" value={open.length} /><Summary icon={<FileText />} label="Order value" value={money(total)} /></div>
    <Card><CardHeader><CardTitle className="text-base">{supplierView ? "Orders linked to your company" : "Orders by supplier"}</CardTitle><CardDescription>Use the eye icon to open an approved purchase order document. Open the PO number for full record details.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">PO number</th>{!supplierView && <th className="px-4 py-3">Supplier</th>}<th className="px-4 py-3">Status</th><th className="px-4 py-3">Expected date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id} className="border-t"><td className="px-4 py-3 font-mono text-xs font-semibold"><button type="button" className="hover:text-primary hover:underline" onClick={() => navigate(`/supplier-portal/purchase-orders/${order._id}`)}>{order.poNumber}</button></td>{!supplierView && <td className="px-4 py-3">{order.supplier?.name ?? "—"}</td>}<td className="px-4 py-3"><Badge variant={order.status === "cancelled" ? "destructive" : "outline"}>{statusLabel(order.status)}</Badge></td><td className="px-4 py-3 text-muted-foreground">{order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : "—"}</td><td className="px-4 py-3 text-right font-medium">{money(order.totalAmount)}</td><td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" title={order.approvedBy && order.status !== "draft" ? "View purchase order document" : "Awaiting manager approval"} aria-label={order.approvedBy && order.status !== "draft" ? "View purchase order document" : "Awaiting manager approval"} disabled={previewBusy === order._id || !order.approvedBy || order.status === "draft"} onClick={() => void viewOrder(order)}>{previewBusy === order._id ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}</Button></td></tr>)}</tbody></table>{!orders.length && <div className="py-16 text-center text-sm text-muted-foreground">No purchase orders found.</div>}</div></CardContent></Card>
    <DocumentViewer document={previewDocument} onOpenChange={closePreview} />
  </div>;
}

function Summary({ icon, label, value }: { icon?: React.ReactNode; label: string; value: unknown }) { return <div className="rounded-xl border bg-card p-4"><p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</p><p className="mt-2 text-lg font-semibold capitalize">{String(value)}</p></div>; }
