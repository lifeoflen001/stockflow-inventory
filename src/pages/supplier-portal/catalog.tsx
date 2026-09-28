import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/lib/system-message.ts";
import { ArrowLeft, Edit3, Files, Loader2, Package, Plus, Trash2 } from "lucide-react";

type Mapping = { id: string; supplierSku: string; supplierPartNumber?: string | null; supplierDescription?: string | null; unitPrice?: number | null; currency?: string | null; unitConversion?: number | null; notes?: string | null; product?: { name?: string; sku?: string } | null };
type CatalogResponse = { supplier: { id: string; name: string; currency?: string }; mappings: Mapping[] };
type CatalogForm = { supplierSku: string; supplierPartNumber: string; supplierDescription: string; unitPrice: string; currency: string; unitConversion: string; notes: string };

const blankForm = (currency = "TZS"): CatalogForm => ({ supplierSku: "", supplierPartNumber: "", supplierDescription: "", unitPrice: "", currency, unitConversion: "1", notes: "" });

function formatMoney(value: number | null | undefined, currency: string) {
  return value == null ? "Price not set" : `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SupplierCatalogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm, confirmationDialog } = useConfirmation();
  const supplierId = user?.supplier?.id;
  const [response, setResponse] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [form, setForm] = useState<CatalogForm>(blankForm());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const { data } = await apiClient.get<CatalogResponse>(`/supplier-catalog/${supplierId}`);
      setResponse(data);
      setForm((current) => current.currency === "TZS" ? { ...current, currency: data.supplier.currency || "TZS" } : current);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to load your product catalogue"));
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(blankForm(response?.supplier.currency || "TZS")); setDialogOpen(true); };
  const openEdit = (mapping: Mapping) => {
    setEditing(mapping);
    setForm({ supplierSku: mapping.supplierSku, supplierPartNumber: mapping.supplierPartNumber || "", supplierDescription: mapping.supplierDescription || mapping.product?.name || "", unitPrice: mapping.unitPrice == null ? "" : String(mapping.unitPrice), currency: mapping.currency || response?.supplier.currency || "TZS", unitConversion: String(mapping.unitConversion ?? 1), notes: mapping.notes || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!supplierId || !form.supplierSku.trim() || !form.supplierDescription.trim()) return;
    setBusy("save");
    try {
      const payload = { supplierSku: form.supplierSku.trim(), supplierPartNumber: form.supplierPartNumber.trim() || null, supplierDescription: form.supplierDescription.trim(), unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice), currency: form.currency.trim().toUpperCase() || "TZS", unitConversion: Number(form.unitConversion || 1), notes: form.notes.trim() || null };
      if (editing) await apiClient.patch(`/supplier-catalog/${supplierId}/items/${editing.id}`, payload);
      else await apiClient.post(`/supplier-catalog/${supplierId}/items`, payload);
      toast.success(editing ? "Catalogue item updated" : "Catalogue item added");
      setDialogOpen(false);
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to save catalogue item"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (mapping: Mapping) => {
    if (!supplierId || !await confirm({ title: "Remove catalogue item?", description: `Remove ${mapping.supplierDescription || mapping.supplierSku} from your catalogue?`, confirmLabel: "Remove item", destructive: true })) return;
    setBusy(mapping.id);
    try {
      await apiClient.delete(`/supplier-catalog/${supplierId}/items/${mapping.id}`);
      toast.success("Catalogue item removed");
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to remove catalogue item"));
    } finally {
      setBusy(null);
    }
  };

  if (!supplierId) return <div className="p-6"><Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Your account is not linked to a supplier company yet.</CardContent></Card></div>;
  if (loading && !response) return <div className="space-y-5 p-6"><Skeleton className="h-12 w-96" /><Skeleton className="h-[520px]" /></div>;

  const currency = response?.supplier.currency || "TZS";
  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Button variant="ghost" className="mb-2 -ml-3" onClick={() => navigate("/supplier-portal")}><ArrowLeft className="size-4" />Back to supplier portal</Button><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="size-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Supplier catalogue</p><h1 className="mt-1 text-2xl font-semibold">Products and prices</h1><p className="text-sm text-muted-foreground">Maintain the products and current prices offered by {response?.supplier.name}.</p></div></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(`/suppliers/${supplierId}/documents`)}><Files className="size-4" />Partnership documents</Button><Button onClick={openCreate}><Plus className="size-4" />Add product</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Summary label="Products listed" value={response?.mappings.length ?? 0} /><Summary label="Prices set" value={(response?.mappings ?? []).filter((item) => item.unitPrice != null).length} /><Summary label="Currency" value={currency} /></div>
    <Card><CardHeader><CardTitle className="text-base">Products you sell</CardTitle><CardDescription>Add products, supplier references and prices. You can update these details whenever your pricing changes.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Supplier SKU / Part</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{(response?.mappings ?? []).map((mapping) => <tr key={mapping.id} className="border-t align-top"><td className="px-4 py-3"><p className="font-medium">{mapping.supplierDescription || mapping.product?.name || "Unnamed product"}</p>{mapping.product?.sku && <p className="mt-1 text-xs text-muted-foreground">Internal reference: {mapping.product.sku}</p>}</td><td className="px-4 py-3 font-mono text-xs"><p>{mapping.supplierSku}</p><p className="mt-1 text-muted-foreground">{mapping.supplierPartNumber || "—"}</p></td><td className="px-4 py-3 text-right font-medium">{formatMoney(mapping.unitPrice, mapping.currency || currency)}<p className="mt-1 text-xs font-normal text-muted-foreground">{mapping.unitConversion ?? 1}× unit</p></td><td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-muted-foreground">{mapping.notes || "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Edit product" aria-label="Edit product" onClick={() => openEdit(mapping)}><Edit3 className="size-4" /></Button><Button variant="ghost" size="icon" title="Remove product" aria-label="Remove product" disabled={busy === mapping.id} onClick={() => void remove(mapping)}>{busy === mapping.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}</Button></div></td></tr>)}</tbody></table>{!(response?.mappings ?? []).length && <div className="py-16 text-center"><Package className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No products listed yet</p><p className="mt-1 text-sm text-muted-foreground">Add your first product and price to build your supplier catalogue.</p><Button className="mt-4" onClick={openCreate}><Plus className="size-4" />Add product</Button></div>}</div></CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Edit catalogue product" : "Add catalogue product"}</DialogTitle><DialogDescription>Keep the product name, supplier reference and current price accurate for procurement teams.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Product name / description" required><Input value={form.supplierDescription} onChange={(event) => setForm({ ...form, supplierDescription: event.target.value })} placeholder="e.g. Air cleaner" /></Field><Field label="Supplier SKU" required><Input value={form.supplierSku} onChange={(event) => setForm({ ...form, supplierSku: event.target.value })} placeholder="e.g. AC-001" /></Field><Field label="Part number"><Input value={form.supplierPartNumber} onChange={(event) => setForm({ ...form, supplierPartNumber: event.target.value })} placeholder="Optional part number" /></Field><Field label="Unit price"><Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} placeholder="0.00" /></Field><Field label="Currency"><Input maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="TZS" /></Field><Field label="Unit conversion"><Input type="number" min="0.000001" step="0.000001" value={form.unitConversion} onChange={(event) => setForm({ ...form, unitConversion: event.target.value })} /></Field><Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional delivery or packaging notes" /></Field></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={busy === "save" || !form.supplierSku.trim() || !form.supplierDescription.trim()} onClick={() => void save()}>{busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{editing ? "Save changes" : "Add product"}</Button></DialogFooter></DialogContent></Dialog>
    {confirmationDialog}
  </div>;
}

function Summary({ label, value }: { label: string; value: unknown }) { return <div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{String(value)}</p></div>; }
function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) { return <div className={className}><Label>{label}{required && <span className="ml-1 text-destructive">*</span>}</Label><div className="mt-1.5">{children}</div></div>; }
