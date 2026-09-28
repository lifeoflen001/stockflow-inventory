import { useMemo, useRef, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { downloadPurchaseOrderPdf, generatePurchaseOrderPdf } from "@/lib/purchase-order-pdf.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/lib/system-message.ts";
import { ArrowLeft, Banknote, CalendarDays, CheckCircle2, Download, Eye, FileCheck2, FileText, Loader2, MessageSquare, PackageCheck, Paperclip, Pencil, Receipt, Save, Send, Trash2, Upload, UserRound, Warehouse, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { DocumentViewer, type DocumentViewerDocument } from "@/components/documents/document-viewer.tsx";

type DocumentRecord = { id: string; type: "receipt" | "invoice" | "proof_of_payment"; title: string; name: string; mimeType: string; size: number; createdAt: string; uploadedBy?: string | null; downloadPath: string };
type CommentRecord = { id: string; body: string; createdAt: string; user?: { name?: string | null } | null };
type POProfile = {
  _id: string; poNumber: string; status: string; expectedDate?: string | null; createdAt: string; notes?: string | null;
  purchaseReason?: string | null; allocation?: string | null; collectedBy?: string | null; approvedBy?: string | null;
  subtotal: number; taxAmount: number; totalAmount: number; paidAmount?: number;
  supplier?: { name?: string; address?: string | null; phone?: string | null; email?: string | null } | null;
  warehouse?: { name?: string } | null; store?: { name?: string } | null; receivingLocation?: { name?: string; type?: "store" | "warehouse" } | null; createdBy?: { name?: string | null } | null;
  items: Array<{ _id: string; orderedQty: number; receivedQty: number; unitCost: number; taxRate: number; total: number; product?: { name?: string } | null }>;
  payments?: Array<{ id: number; amount: number; recordedAt?: string | null; recordedBy?: string | null }>;
  documents?: DocumentRecord[]; comments?: CommentRecord[];
};

const statusStyle: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", sent: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300", confirmed: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", partial: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", cancelled: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

const formatMoney = (value: number | null | undefined, currency: string) => `${currency} ${Number(value ?? 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fileSize = (value: number) => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;

export default function PurchaseOrderDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const po = useApiQuery(endpoints.procurement.getPurchaseOrder, id ? { id } : "skip") as POProfile | undefined;
  const backPath = location.pathname.startsWith("/supplier-portal/") ? "/supplier-portal" : "/procurement";
  const companies = useApiQuery(endpoints.organizationStructure.listCompanies);
  const departmentsResponse = useApiQuery(endpoints.organizationStructure.listDepartments);
  const departments = (departmentsResponse?.data ?? []).filter((department) => department.is_active !== false);
  const company = companies?.data?.find((entry) => entry.is_active === true) ?? companies?.data?.[0];
  const currency = company?.currency ?? "TSHS";
  const money = (value: number | null | undefined) => formatMoney(value, currency);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentRecord | null>(null);
  const [previewPdf, setPreviewPdf] = useState<DocumentViewerDocument | null>(null);
  const [editingContext, setEditingContext] = useState(false);
  const [contextForm, setContextForm] = useDraftState("procurement-details", { purchaseReason: "", allocation: "", allocationDepartmentId: "" });
  const receiptInput = useRef<HTMLInputElement>(null);
  const invoiceInput = useRef<HTMLInputElement>(null);
  const canManageRecords = user?.role === "super_admin" || user?.permissions.some((permission) => ["purchase_orders.create", "purchase_orders.approve", "goods_receipts.create"].includes(permission));
  const canApprovePO = user?.role === "super_admin" || user?.permissions.includes("purchase_orders.approve");
  const canEditContext = ["super_admin", "procurement_manager", "procurement_officer"].includes(user?.role ?? "");

  const received = useMemo(() => (po?.items ?? []).reduce((total, item) => total + item.receivedQty, 0), [po]);
  const ordered = useMemo(() => (po?.items ?? []).reduce((total, item) => total + item.orderedQty, 0), [po]);
  const receivePercent = ordered ? Math.min(100, (received / ordered) * 100) : 0;
  const paymentPercent = po?.totalAmount ? Math.min(100, (Number(po.paidAmount ?? 0) / po.totalAmount) * 100) : 0;

  const refresh = () => window.dispatchEvent(new Event("stockflow:api-invalidated"));

  const upload = async (type: "receipt" | "invoice", file?: File) => {
    if (!id || !file) return;
    setBusy(type);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("file", file);
      await apiClient.post(`/purchase-orders/${id}/documents`, formData);
      toast.success(`${type === "receipt" ? "Receipt" : "Invoice"} uploaded`);
      refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to upload this document"));
    } finally {
      setBusy(null);
      if (type === "receipt" && receiptInput.current) receiptInput.current.value = "";
      if (type === "invoice" && invoiceInput.current) invoiceInput.current.value = "";
    }
  };

  const download = async (record: DocumentRecord) => {
    try {
      const response = await apiClient.get(record.downloadPath, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = record.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to download this document"));
    }
  };

  const removeDocument = async (document: DocumentRecord) => {
    if (!id || !window.confirm(`Remove ${document.name}?`)) return;
    setBusy(document.id);
    try {
      await apiClient.delete(`/purchase-orders/${id}/documents/${document.id}`);
      toast.success("Document removed");
      refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to remove this document"));
    } finally { setBusy(null); }
  };

  const addComment = async () => {
    if (!id || !comment.trim()) return;
    setBusy("comment");
    try {
      await apiClient.post(`/purchase-orders/${id}/comments`, { body: comment.trim() });
      setComment("");
      toast.success("Comment added");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to add comment")); }
    finally { setBusy(null); }
  };

  const startEditingContext = () => {
    if (!po) return;
    const selectedDepartment = departments.find((department) => department.name === po.allocation);
    setContextForm({ purchaseReason: po.purchaseReason ?? "", allocation: po.allocation ?? "", allocationDepartmentId: selectedDepartment ? String(selectedDepartment.id) : po.allocation ? `legacy:${po.allocation}` : "" });
    setEditingContext(true);
  };

  const saveContext = async () => {
    if (!id) return;
    setBusy("context");
    try {
      await apiClient.patch(`/purchase-orders/${id}/profile`, {
        purchaseReason: contextForm.purchaseReason,
        allocation: contextForm.allocation,
        allocationDepartmentId: contextForm.allocationDepartmentId.startsWith("legacy:") ? undefined : Number(contextForm.allocationDepartmentId),
      });
      setEditingContext(false);
      toast.success("PO details updated");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to update PO details")); }
    finally { setBusy(null); }
  };

  const downloadPdf = async () => {
    if (!po) return;
    if (po.status === "draft" || !po.approvedBy) {
      toast.error("This PO must be approved by a procurement manager before it can be downloaded.");
      return;
    }
    toast.loading("Generating approved PO PDF...");
    try {
      await downloadPurchaseOrderPdf({ ...po, signatureName: user?.profile.name, signatureUrl: user?.profile.signatureUrl }, company);
      toast.success("Approved PO PDF downloaded successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to generate the approved PO PDF"));
    }
  };

  const previewPurchaseOrderPdf = async () => {
    if (!po) return;
    if (po.status === "draft" || !po.approvedBy) {
      toast.error("This PO must be approved by a procurement manager before it can be previewed.");
      return;
    }
    setBusy("preview-pdf");
    try {
      const blob = await generatePurchaseOrderPdf({ ...po, signatureName: user?.profile.name, signatureUrl: user?.profile.signatureUrl }, company);
      const previewUrl = URL.createObjectURL(blob);
      setPreviewPdf({ name: `${po.poNumber}.pdf`, mimeType: "application/pdf", downloadPath: "", previewUrl });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to preview the approved PO PDF"));
    } finally {
      setBusy(null);
    }
  };

  const approvePurchaseOrder = async () => {
    if (!id || !po || !["draft", "sent"].includes(po.status) || (po.status === "sent" && po.approvedBy) || !canApprovePO) return;
    setBusy("approval");
    try {
      await apiClient.patch(`/purchase-orders/${id}/status`, { status: "sent" });
      toast.success("Purchase order approved");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to approve this purchase order")); }
    finally { setBusy(null); }
  };

  if (!id || po === undefined) return <DetailsSkeleton />;
  if (!po || !po.poNumber) return <div className="p-6"><Button variant="outline" onClick={() => navigate(backPath)}><ArrowLeft className="size-4" />Back to {backPath === "/supplier-portal" ? "supplier portal" : "procurement"}</Button><p className="mt-8 text-center text-sm text-muted-foreground">Purchase order not found.</p></div>;

  const documents = po.documents ?? [];
  const items = po.items ?? [];
  const receipts = documents.filter((document) => document.type === "receipt");
  const invoices = documents.filter((document) => document.type === "invoice");
  const proofsOfPayment = documents.filter((document) => document.type === "proof_of_payment");

  return (
    <div className="min-w-0 space-y-5 p-4 pb-24 sm:p-6 md:pb-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate(backPath)} aria-label={backPath === "/supplier-portal" ? "Back to supplier portal" : "Back to procurement"}><ArrowLeft className="size-4" /></Button>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold sm:text-2xl">{po.poNumber}</h1><Badge className={cn("capitalize", statusStyle[po.status])}>{po.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Full purchase order record · created {po.createdAt ? format(parseISO(po.createdAt), "MMM d, yyyy") : "date unavailable"}</p></div>
        </div>
        <div className="flex flex-wrap gap-2 pl-12 lg:justify-end lg:pl-0">{canApprovePO && (po.status === "draft" || (po.status === "sent" && !po.approvedBy)) && <Button onClick={() => void approvePurchaseOrder()} disabled={busy === "approval"}><CheckCircle2 className="size-4" />{busy === "approval" ? "Approving…" : "Approve PO"}</Button>}{canEditContext && <Button variant="outline" onClick={startEditingContext}><Pencil className="size-4" />Edit details</Button>}<Button variant="outline" size="icon" title={po.approvedBy ? "Preview approved LPO PDF" : "Approval required before previewing LPO PDF"} aria-label="Preview approved LPO PDF" disabled={!po.approvedBy || po.status === "draft" || busy === "preview-pdf"} onClick={() => void previewPurchaseOrderPdf()}>{busy === "preview-pdf" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}</Button><Button variant="outline" disabled={!po.approvedBy || po.status === "draft"} title={po.approvedBy ? "Download approved LPO PDF" : "Approval required before downloading LPO PDF"} onClick={() => void downloadPdf()}><Download className="size-4" />{po.approvedBy ? "Download LPO" : "Awaiting approval"}</Button></div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/20 pb-4"><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="size-4 text-primary" />Order overview</CardTitle><CardDescription>Purpose, ownership and financial position at a glance.</CardDescription></CardHeader><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><Fact label="Supplier" value={po.supplier?.name} icon={<UserRound className="size-4" />} /><Fact label="Receiving location" value={po.receivingLocation?.name ?? po.warehouse?.name ?? po.store?.name} icon={<Warehouse className="size-4" />} /><Fact label="Expected delivery" value={po.expectedDate ? format(parseISO(po.expectedDate), "MMM d, yyyy") : "Not set"} icon={<CalendarDays className="size-4" />} /><Fact label="Created by" value={po.createdBy?.name} icon={<UserRound className="size-4" />} /></CardContent></Card>

          {editingContext ? <Card className="md:col-span-2"><CardHeader className="pb-3"><CardTitle className="text-base">Edit PO details</CardTitle><CardDescription>Update the reason for purchase and choose the department receiving the allocation.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="purchase-reason">Reason for purchase</Label><Textarea id="purchase-reason" value={contextForm.purchaseReason} onChange={(event) => setContextForm({ ...contextForm, purchaseReason: event.target.value })} rows={4} /></div><div className="space-y-1.5"><Label>Allocating to</Label><Select value={contextForm.allocationDepartmentId} onValueChange={(value) => { const department = departments.find((item) => String(item.id) === value); setContextForm({ ...contextForm, allocationDepartmentId: value, allocation: department?.name ?? contextForm.allocation }); }}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{contextForm.allocationDepartmentId.startsWith("legacy:") && <SelectItem value={contextForm.allocationDepartmentId}>{contextForm.allocation} (existing)</SelectItem>}{departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}{department.branch?.name ? ` · ${department.branch.name}` : ""}</SelectItem>)}</SelectContent></Select>{!departments.length && <p className="text-xs text-muted-foreground">No departments are available.</p>}</div></div><div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setEditingContext(false)}><X className="size-4" />Cancel</Button><Button disabled={busy === "context" || !contextForm.allocationDepartmentId} onClick={() => void saveContext()}>{busy === "context" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save details</Button></div></CardContent></Card> : <div className="grid gap-5 md:grid-cols-2"><InfoCard title="Reason for purchase" icon={<MessageSquare className="size-4 text-primary" />} value={po.purchaseReason} empty="No purchase reason recorded." /><InfoCard title="Allocating to" icon={<Warehouse className="size-4 text-primary" />} value={po.allocation} empty="No department allocation recorded." /></div>}

          <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="size-4 text-primary" />Order lines</CardTitle><CardDescription>{items.length} line items · {received} of {ordered} units received</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Unit cost</th><th className="px-4 py-3 text-right">Line total</th></tr></thead><tbody>{items.map((item) => <tr key={item._id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{item.product?.name ?? "Unnamed product"}</p></td><td className="px-4 py-3 text-right tabular-nums">{item.orderedQty}</td><td className="px-4 py-3 text-right tabular-nums"><span className={item.receivedQty >= item.orderedQty ? "font-semibold text-emerald-600" : item.receivedQty > 0 ? "font-semibold text-amber-600" : "text-muted-foreground"}>{item.receivedQty}</span></td><td className="px-4 py-3 text-right tabular-nums">{money(item.unitCost)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(item.total)}</td></tr>)}</tbody></table></div><div className="flex flex-col gap-2 border-t bg-muted/10 p-4 text-sm sm:items-end"><div className="flex w-full justify-between gap-8 sm:w-72"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{money(po.subtotal)}</span></div><div className="flex w-full justify-between gap-8 sm:w-72"><span className="text-muted-foreground">Tax</span><span className="font-mono">{money(po.taxAmount)}</span></div><div className="flex w-full justify-between gap-8 border-t pt-2 font-bold sm:w-72"><span>Total</span><span className="font-mono">{money(po.totalAmount)}</span></div></div></CardContent></Card>

          <DocumentSection title="Receipts" description="Goods receipt notes, delivery acknowledgements and receiving evidence." icon={<Receipt className="size-4 text-emerald-600" />} documents={receipts} inputRef={receiptInput} busy={busy === "receipt"} canManage={canManageRecords} onUpload={(file) => void upload("receipt", file)} onPreview={setPreviewDocument} onDownload={download} onDelete={removeDocument} />
          <DocumentSection title="Invoices" description="Supplier invoices and supporting financial documents for this order." icon={<FileText className="size-4 text-blue-600" />} documents={invoices} inputRef={invoiceInput} busy={busy === "invoice"} canManage={canManageRecords} onUpload={(file) => void upload("invoice", file)} onPreview={setPreviewDocument} onDownload={download} onDelete={removeDocument} />
          <DocumentSection title="Proofs of payment" description="Payment verification evidence attached by the accountant." icon={<Banknote className="size-4 text-emerald-600" />} documents={proofsOfPayment} inputRef={invoiceInput} busy={false} canManage={false} onUpload={() => undefined} onPreview={setPreviewDocument} onDownload={download} onDelete={removeDocument} />
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-5 xl:self-start">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Supplier profile</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-semibold">{po.supplier?.name ?? "No supplier"}</p><p className="mt-1 whitespace-pre-line text-muted-foreground">{po.supplier?.address || "No address recorded"}</p></div>{po.supplier?.phone && <p className="text-muted-foreground">{po.supplier.phone}</p>}{po.supplier?.email && <p className="break-all text-muted-foreground">{po.supplier.email}</p>}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Workflow progress</CardTitle></CardHeader><CardContent className="space-y-5"><ProgressRow label="Goods received" value={`${received} / ${ordered} units`} percent={receivePercent} color="bg-emerald-500" /><ProgressRow label="Payment recorded" value={`${money(po.paidAmount)} / ${money(po.totalAmount)}`} percent={paymentPercent} color="bg-blue-500" /></CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Approvals & collection</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Fact label="Authorized by" value={po.createdBy?.name} /><Fact label="Collected by" value={po.collectedBy} /><Fact label="Approved by" value={po.approvedBy} /></CardContent></Card>
          {po.notes && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Internal notes</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{po.notes}</CardContent></Card>}
          <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Banknote className="size-4 text-primary" />Payments</CardTitle></CardHeader><CardContent className="space-y-3">{po.payments?.length ? po.payments.map((payment) => <div key={payment.id} className="flex items-start justify-between gap-3 text-sm"><div><p className="font-medium">{money(payment.amount)}</p><p className="text-xs text-muted-foreground">{payment.recordedBy ?? "Recorded user"}{payment.recordedAt ? ` · ${format(parseISO(payment.recordedAt), "MMM d, yyyy")}` : ""}</p></div><CheckCircle2 className="size-4 shrink-0 text-emerald-600" /></div>) : <p className="text-sm text-muted-foreground">No payments recorded.</p>}</CardContent></Card>
        </aside>
      </div>

      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4 text-primary" />Comments & discussion</CardTitle><CardDescription>Keep decisions, clarifications and follow-ups attached to this order.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="po-comment">Add a comment</Label><Textarea id="po-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write an update or question about this order…" rows={3} /></div><Button className="sm:mb-0" disabled={!comment.trim() || busy === "comment"} onClick={() => void addComment()}>{busy === "comment" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Post comment</Button></div><Separator />{po.comments?.length ? <div className="space-y-4">{po.comments.map((item) => <div key={item.id} className="flex gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{item.user?.name?.charAt(0).toUpperCase() ?? "?"}</div><div className="min-w-0 flex-1 rounded-lg bg-muted/40 px-3 py-2.5"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-sm font-medium">{item.user?.name ?? "Former user"}</p><time className="text-[11px] text-muted-foreground">{format(parseISO(item.createdAt), "MMM d, yyyy · h:mm a")}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.body}</p></div></div>)}</div> : <div className="py-6 text-center text-sm text-muted-foreground">No comments yet. Add the first order update above.</div>}</CardContent></Card>
      <DocumentViewer document={previewDocument} onOpenChange={(document) => { if (!document) setPreviewDocument(null); }} />
      <DocumentViewer document={previewPdf} onOpenChange={(document) => { if (!document && previewPdf?.previewUrl) URL.revokeObjectURL(previewPdf.previewUrl); if (!document) setPreviewPdf(null); }} />
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) { return <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</p><p className="mt-1 truncate font-medium">{value || "Not recorded"}</p></div>; }
function InfoCard({ title, icon, value, empty }: { title: string; icon: React.ReactNode; value?: string | null; empty: string }) { return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader><CardContent><p className={cn("whitespace-pre-wrap break-words text-sm leading-6", value ? "text-foreground" : "text-muted-foreground")}>{value || empty}</p></CardContent></Card>; }
function ProgressRow({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) { return <div><div className="mb-1.5 flex justify-between gap-3 text-sm"><span>{label}</span><span className="text-right text-xs text-muted-foreground">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} /></div><p className="mt-1 text-right text-[11px] text-muted-foreground">{percent.toFixed(0)}%</p></div>; }
function DocumentSection({ title, description, icon, documents, inputRef, busy, canManage, onUpload, onPreview, onDownload, onDelete }: { title: string; description: string; icon: React.ReactNode; documents: DocumentRecord[]; inputRef: React.RefObject<HTMLInputElement | null>; busy: boolean | string | null; canManage?: boolean; onUpload: (file?: File) => void; onPreview: (document: DocumentRecord) => void; onDownload: (document: DocumentRecord) => void; onDelete: (document: DocumentRecord) => void }) { return <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base">{icon}{title}<Badge variant="secondary">{documents.length}</Badge></CardTitle><CardDescription className="mt-1">{description}</CardDescription></div>{canManage && <><input ref={inputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => onUpload(event.target.files?.[0])} /><Button variant="outline" size="sm" disabled={busy === true || typeof busy === "string"} onClick={() => inputRef.current?.click()}>{busy === true ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload</Button></>}</div></CardHeader><CardContent className="space-y-2">{documents.length ? documents.map((document) => <div key={document.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"><Paperclip className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.title}</p><p className="truncate text-xs text-muted-foreground">{document.name} · {fileSize(document.size)}{document.uploadedBy ? ` · ${document.uploadedBy}` : ""}</p></div><Button variant="ghost" size="icon" title="View document" aria-label="View document" onClick={() => onPreview(document)}><FileText className="size-4" /></Button><Button variant="ghost" size="icon" title="Download" aria-label="Download document" onClick={() => onDownload(document)}><Download className="size-4" /></Button>{canManage && <Button variant="ghost" size="icon" title="Remove" className="text-destructive" disabled={busy === document.id} onClick={() => void onDelete(document)}>{busy === document.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>}</div>) : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"><Upload className="mx-auto mb-2 size-5" />No {title.toLowerCase()} uploaded yet.</div>}</CardContent></Card>; }
function DetailsSkeleton() { return <div className="space-y-5 p-4 sm:p-6"><Skeleton className="h-10 w-full max-w-xl" /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-5"><Skeleton className="h-40" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div><div className="space-y-5"><Skeleton className="h-52" /><Skeleton className="h-36" /></div></div></div>; }
