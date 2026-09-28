import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import { DocumentViewer, type DocumentViewerDocument } from "@/components/documents/document-viewer.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import { ArrowLeft, CalendarDays, Download, Eye, FileText, Files, Grid2X2, List, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";

type SupplierDocument = DocumentViewerDocument & {
  id: string;
  type: "contract" | "compliance" | "insurance" | "other";
  title: string;
  size?: number | null;
  expiresAt?: string | null;
  expiryStatus?: "none" | "expired" | "expiring" | "valid";
  notes?: string | null;
  createdAt?: string | null;
  uploadedBy?: string | null;
};

type DocumentResponse = { supplier: { id: string; name: string }; documents: SupplierDocument[] };

const formatSize = (bytes?: number | null) => !bytes ? "—" : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const emptyForm = { type: "other" as SupplierDocument["type"], title: "", expiresAt: "", notes: "", file: null as File | null };

export default function SupplierDocumentsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm, confirmationDialog } = useConfirmation();
  const [response, setResponse] = useState<DocumentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<SupplierDocument | null>(null);
  const canManage = Boolean(user?.role === "super_admin" || user?.permissions.some((permission) => ["master_data.manage", "supplier_documents.upload"].includes(permission)));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await apiClient.get<DocumentResponse>(`/suppliers/${id}/documents`);
      setResponse(data);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to load supplier documents"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const documents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return response?.documents ?? [];
    return (response?.documents ?? []).filter((document) => `${document.title} ${document.name} ${document.type} ${document.notes ?? ""}`.toLowerCase().includes(query));
  }, [response?.documents, search]);

  const upload = async () => {
    if (!id || !form.file) return;
    setBusy("upload");
    try {
      const data = new FormData();
      data.append("file", form.file);
      data.append("type", form.type);
      if (form.title.trim()) data.append("title", form.title.trim());
      if (form.expiresAt) data.append("expiresAt", form.expiresAt);
      if (form.notes.trim()) data.append("notes", form.notes.trim());
      await apiClient.post(`/suppliers/${id}/documents`, data);
      toast.success("Partnership document uploaded");
      setUploadOpen(false);
      setForm(emptyForm);
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to upload supplier document"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (document: SupplierDocument) => {
    if (!id || !await confirm({ title: "Delete document?", description: `Delete ${document.name}? This cannot be undone.`, confirmLabel: "Delete document", destructive: true })) return;
    setBusy(document.id);
    try {
      await apiClient.delete(`/suppliers/${id}/documents/${document.id}`);
      toast.success("Supplier document deleted");
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to delete supplier document"));
    } finally {
      setBusy(null);
    }
  };

  if (!id || loading && !response) return <div className="space-y-5 p-6"><Skeleton className="h-10 w-80" /><Skeleton className="h-[620px]" /></div>;

  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Button variant="ghost" className="mb-2 -ml-3" onClick={() => navigate(user?.role === "supplier" ? "/supplier-portal" : `/suppliers/${id}`)}><ArrowLeft className="size-4" />Back</Button><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Files className="size-5" /></div><div><h1 className="text-2xl font-semibold">Partnership documents</h1><p className="text-sm text-muted-foreground">{response?.supplier.name ?? "Supplier account"} · private document workspace</p></div></div></div>
      {canManage && <Button onClick={() => { setForm(emptyForm); setUploadOpen(true); }}><Plus className="size-4" />Upload document</Button>}
    </div>

    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search partnership documents..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="flex rounded-md border"><Button size="icon" variant={view === "grid" ? "default" : "ghost"} title="Grid view" onClick={() => setView("grid")}><Grid2X2 className="size-4" /></Button><Button size="icon" variant={view === "list" ? "default" : "ghost"} title="List view" onClick={() => setView("list")}><List className="size-4" /></Button></div><Badge variant="secondary"><Files className="size-3" />{response?.documents.length ?? 0} Documents</Badge></CardContent></Card>

    {documents.length ? <div className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "space-y-2")}>{documents.map((document) => <SupplierDocumentCard key={document.id} document={document} list={view === "list"} canManage={canManage} busy={busy} onPreview={() => setPreviewDocument(document)} onDownload={() => setPreviewDocument(document)} onDelete={() => void remove(document)} />)}</div> : <Card><CardContent className="py-20 text-center"><FileText className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-4 font-semibold">No partnership documents</h2><p className="mt-1 text-sm text-muted-foreground">Upload contracts, certificates, agreements, or other supplier documents for this account.</p>{canManage && <Button className="mt-5" onClick={() => { setForm(emptyForm); setUploadOpen(true); }}><Upload className="size-4" />Upload first document</Button>}</CardContent></Card>}

    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Upload partnership document</DialogTitle></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="supplier-document-type">Document type</Label><select id="supplier-document-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as SupplierDocument["type"] })}><option value="contract">Contract / agreement</option><option value="compliance">Compliance certificate</option><option value="insurance">Insurance document</option><option value="other">Other partnership document</option></select></div><div className="space-y-1.5"><Label htmlFor="supplier-document-expiry">Expiry date (optional)</Label><Input id="supplier-document-expiry" type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-document-title">Document title</Label><Input id="supplier-document-title" placeholder="e.g. 2026 partnership agreement" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-document-file">File</Label><Input id="supplier-document-file" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })} /><p className="text-xs text-muted-foreground">PDF, image, Office, CSV, or text files up to 25 MB.</p></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-document-notes">Notes (optional)</Label><Textarea id="supplier-document-notes" rows={3} placeholder="Add context for this document" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button><Button onClick={() => void upload()} disabled={busy === "upload" || !form.file}>{busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload document</Button></DialogFooter></DialogContent></Dialog>
    <DocumentViewer document={previewDocument} onOpenChange={(document) => { if (!document) setPreviewDocument(null); }} />{confirmationDialog}
  </div>;
}

function SupplierDocumentCard({ document, list, canManage, busy, onPreview, onDownload, onDelete }: { document: SupplierDocument; list: boolean; canManage: boolean; busy: string | null; onPreview: () => void; onDownload: () => void; onDelete: () => void }) {
  return <Card className={cn("group overflow-hidden", list && "flex items-center")}><button type="button" onClick={onPreview} className={cn("flex items-center justify-center bg-muted/50", list ? "size-16 shrink-0" : "h-40 w-full")} title={`Preview ${document.name}`}><FileText className="size-12 text-primary/70" /></button><CardContent className={cn("min-w-0 flex-1 p-3", list && "flex items-center gap-4")}><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium" title={document.title}>{document.title}</p>{document.expiryStatus && document.expiryStatus !== "none" && <Badge variant={document.expiryStatus === "expired" ? "destructive" : document.expiryStatus === "expiring" ? "secondary" : "outline"}>{document.expiryStatus}</Badge>}</div><p className="mt-1 truncate text-xs text-muted-foreground" title={document.name}>{document.name}</p><div className="mt-2 space-y-1 text-xs text-muted-foreground"><p>{document.type.replaceAll("_", " ")} · {formatSize(document.size)}</p><p><CalendarDays className="mr-1 inline size-3" />{document.expiresAt ? `Expires ${formatDate(document.expiresAt)}` : `Added ${formatDate(document.createdAt)}`}</p></div></div><div className="flex items-center"><Button variant="ghost" size="icon" title="Preview document" onClick={onPreview}><Eye className="size-4" /></Button><Button variant="ghost" size="icon" title="Download document" onClick={onDownload}><Download className="size-4" /></Button>{canManage && <Button variant="ghost" size="icon" title="Delete document" className="text-muted-foreground hover:text-destructive" disabled={busy === document.id} onClick={onDelete}>{busy === document.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>}</div></CardContent></Card>;
}
