import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { downloadPettyCashPdf, generatePettyCashPdf } from "@/lib/petty-cash-pdf.ts";
import { DocumentViewer, type DocumentViewerDocument } from "@/components/documents/document-viewer.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/lib/system-message.ts";
import { ArrowLeft, Banknote, Download, Eye, FileText, Loader2, MessageSquare, Paperclip, Send, Trash2, Upload, UserRound } from "lucide-react";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type DocumentRecord = { id: string; title: string; name: string; mimeType: string; size: number; createdAt?: string | null; uploadedBy?: string | null; downloadPath: string };
type CommentRecord = { id: string; body: string; createdAt?: string | null; user?: { name?: string | null } | null };
type PettyCashProfile = {
  id: string; voucherNumber: string; issuedAt: string; collector: string; requiredFor: string; amount: number; currency: string; notes?: string | null;
  issuedBy?: { name?: string | null } | null; documents?: DocumentRecord[]; comments?: CommentRecord[];
};

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "-";
const formatAmount = (value: number, currency: string) => `${currency} ${Number(value || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fileSize = (value: number) => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;

export default function PettyCashDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const voucher = useApiQuery(endpoints.procurement.getPettyCash, id ? { id } : "skip") as PettyCashProfile | undefined;
  const companyResponse = useApiQuery(endpoints.organizationStructure.listCompanies);
  const company = companyResponse?.data?.find((entry) => entry.is_active === true) ?? companyResponse?.data?.[0];
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [previewDocument, setPreviewDocument] = useState<DocumentViewerDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canManageDocuments = user?.role === "super_admin" || user?.permissions.includes("petty_cash.create");

  const refresh = () => window.dispatchEvent(new Event("stockflow:api-invalidated"));

  const previewPdf = async () => {
    if (!voucher) return;
    setBusy("preview");
    try {
      const blob = await generatePettyCashPdf({ ...voucher, signatureUrl: user?.profile.signatureUrl }, company);
      setPreviewDocument({ name: `${voucher.voucherNumber}.pdf`, mimeType: "application/pdf", downloadPath: "", previewUrl: URL.createObjectURL(blob) });
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to preview this voucher")); }
    finally { setBusy(null); }
  };

  const downloadPdf = async () => {
    if (!voucher) return;
    try {
      await downloadPettyCashPdf({ ...voucher, signatureUrl: user?.profile.signatureUrl }, company);
      toast.success("Petty cash PDF downloaded");
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to download this voucher")); }
  };

  const uploadDocument = async (file?: File) => {
    if (!id || !file) return;
    setBusy("upload");
    try {
      const formData = new FormData();
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("file", file);
      await apiClient.post(`/petty-cash/${id}/documents`, formData);
      toast.success("Document uploaded");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to upload this document")); }
    finally { setBusy(null); if (fileInput.current) fileInput.current.value = ""; }
  };

  const previewFile = (document: DocumentRecord) => setPreviewDocument(document);

  const downloadFile = async (document: DocumentRecord) => {
    try {
      const response = await apiClient.get(document.downloadPath, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to download this document")); }
  };

  const removeFile = async (document: DocumentRecord) => {
    if (!id || !window.confirm(`Remove ${document.name}?`)) return;
    setBusy(document.id);
    try {
      await apiClient.delete(`/petty-cash/${id}/documents/${document.id}`);
      toast.success("Document removed");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to remove this document")); }
    finally { setBusy(null); }
  };

  const addComment = async () => {
    if (!id || !comment.trim()) return;
    setBusy("comment");
    try {
      await apiClient.post(`/petty-cash/${id}/comments`, { body: comment.trim() });
      setComment("");
      toast.success("Comment added");
      refresh();
    } catch (error) { toast.error(getApiErrorMessage(error, "Unable to add comment")); }
    finally { setBusy(null); }
  };

  if (voucher === undefined) return <PageContentLoader variant="table" />;
  if (!voucher?.voucherNumber) return <div className="p-6"><Button variant="outline" onClick={() => navigate("/petty-cash")}><ArrowLeft className="size-4" />Back to petty cash</Button><p className="mt-8 text-center text-sm text-muted-foreground">Petty cash voucher not found.</p></div>;

  const documents = voucher.documents ?? [];
  return (
    <div className="min-w-0 space-y-5 p-4 pb-24 sm:p-6 md:pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3"><Button variant="outline" size="icon" onClick={() => navigate("/petty-cash")} aria-label="Back to petty cash"><ArrowLeft className="size-4" /></Button><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-bold sm:text-2xl">{voucher.voucherNumber}</h1><Badge>Issued</Badge></div><p className="mt-1 text-sm text-muted-foreground">Petty cash voucher · issued {formatDate(voucher.issuedAt)}</p></div></div>
        <div className="flex flex-wrap gap-2 pl-12 sm:pl-0"><Button variant="outline" onClick={() => void previewPdf()} disabled={busy === "preview"}><Eye className="size-4" />{busy === "preview" ? "Preparing…" : "Preview PDF"}</Button><Button onClick={() => void downloadPdf()}><Download className="size-4" />Download PDF</Button></div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card><CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Banknote className="size-4 text-primary" />Voucher details</CardTitle><CardDescription>Core information and purpose recorded for this petty cash issue.</CardDescription></CardHeader><CardContent className="grid gap-5 pt-5 sm:grid-cols-2"><Detail label="Voucher number" value={voucher.voucherNumber} /><Detail label="Issued date" value={formatDate(voucher.issuedAt)} /><Detail label="Collector / beneficiary" value={voucher.collector} /><Detail label="Issued by" value={voucher.issuedBy?.name ?? "-"} /><div className="sm:col-span-2"><Detail label="Reason for voucher" value={voucher.requiredFor} /></div>{voucher.notes && <div className="sm:col-span-2"><Detail label="Notes" value={voucher.notes} /></div>}</CardContent></Card>
          <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Paperclip className="size-4 text-primary" />Related documents<Badge variant="secondary">{documents.length}</Badge></CardTitle><CardDescription className="mt-1">Receipts and supporting files attached to this voucher.</CardDescription></div>{canManageDocuments && <><input ref={fileInput} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => void uploadDocument(event.target.files?.[0])} /><Button variant="outline" size="sm" disabled={busy === "upload"} onClick={() => fileInput.current?.click()}>{busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload</Button></>}</div></CardHeader><CardContent className="space-y-2">{documents.length ? documents.map((document) => <div key={document.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"><FileText className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.title}</p><p className="truncate text-xs text-muted-foreground">{document.name} · {fileSize(document.size)}{document.uploadedBy ? ` · ${document.uploadedBy}` : ""}</p></div><Button variant="ghost" size="icon" title="View document" onClick={() => previewFile(document)}><Eye className="size-4" /></Button><Button variant="ghost" size="icon" title="Download document" onClick={() => void downloadFile(document)}><Download className="size-4" /></Button>{canManageDocuments && <Button variant="ghost" size="icon" title="Remove document" className="text-destructive" disabled={busy === document.id} onClick={() => void removeFile(document)}>{busy === document.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>}</div>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><Upload className="mx-auto mb-2 size-5" />No documents attached yet.</div>}</CardContent></Card>
          <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4 text-primary" />Comments &amp; discussion</CardTitle><CardDescription>Keep clarifications and follow-ups attached to this voucher.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="petty-cash-comment">Add a comment</Label><Textarea id="petty-cash-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write an update or note about this voucher…" rows={3} /></div><Button disabled={!comment.trim() || busy === "comment"} onClick={() => void addComment()}>{busy === "comment" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Post comment</Button></div><Separator />{voucher.comments?.length ? <div className="space-y-4">{voucher.comments.map((item) => <div key={item.id} className="flex gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{item.user?.name?.charAt(0).toUpperCase() ?? "?"}</div><div className="min-w-0 flex-1 rounded-lg bg-muted/40 px-3 py-2.5"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-sm font-medium">{item.user?.name ?? "Former user"}</p><time className="text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.body}</p></div></div>)}</div> : <div className="py-6 text-center text-sm text-muted-foreground">No comments yet. Add the first voucher update above.</div>}</CardContent></Card>
        </div>
        <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Financial summary</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Amount issued</p><p className="mt-1 text-2xl font-bold">{formatAmount(voucher.amount, voucher.currency)}</p></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Record owner</CardTitle></CardHeader><CardContent className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="font-medium">{voucher.issuedBy?.name ?? "Former user"}</p><p className="text-xs text-muted-foreground">Issued by</p></div></CardContent></Card></div>
      </div>
      <DocumentViewer document={previewDocument} onOpenChange={(document) => { if (!document && previewDocument?.previewUrl) URL.revokeObjectURL(previewDocument.previewUrl); if (!document) setPreviewDocument(null); }} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value || "-"}</p></div>; }
