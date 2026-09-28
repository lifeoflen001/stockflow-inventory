import { useMemo, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { AlertTriangle, CheckCircle2, MapPin, Pencil, Search, Warehouse } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type LocatorRow = { id: string; product: { id: string; name: string; sku?: string | null }; quantity: number; reorderLevel: number; location?: { id: string; section?: string | null; shelf?: string | null; notes?: string | null } | null };
type LocatorResponse = { warehouse?: { id: string; name: string } | null; rows: LocatorRow[] };
const EMPTY_LOCATOR_ROWS: LocatorRow[] = [];

export default function WarehouseLocatorPage() {
  const { user } = useAuth();
  const warehousesResponse = useApiQuery(endpoints.warehouses.listWarehouses);
  const warehouses = (warehousesResponse ?? []) as Array<{ _id: string; name: string }>;
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [editing, setEditing] = useState<LocatorRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useDraftState("warehouse-locator", { section: "", shelf: "", notes: "" });
  const selectedWarehouseId = warehouseId || warehouses[0]?._id || "";
  const locatorResponse = useApiQuery(endpoints.warehouseLocator.list, selectedWarehouseId ? { warehouseId: selectedWarehouseId } : "skip");
  const payload = locatorResponse as LocatorResponse | undefined;
  const updateLocation = useApiMutation(endpoints.warehouseLocator.update);
  const canManage = user?.role === "super_admin" || user?.permissions.includes("warehouse_locator.manage");
  const rows = payload?.rows ?? EMPTY_LOCATOR_ROWS;
  const filteredRows = useMemo(() => rows.filter((row) => {
    const haystack = `${row.product.name} ${row.product.sku ?? ""} ${row.location?.section ?? ""} ${row.location?.shelf ?? ""} ${row.location?.notes ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase()) && (!onlyUnassigned || !row.location?.section && !row.location?.shelf);
  }), [onlyUnassigned, rows, search]);

  if (warehousesResponse === undefined || (selectedWarehouseId && locatorResponse === undefined)) return <PageContentLoader variant="table" />;

  const locatedCount = rows.filter((row) => row.location?.section || row.location?.shelf).length;
  const openEditor = (row: LocatorRow) => { setEditing(row); setForm({ section: row.location?.section ?? "", shelf: row.location?.shelf ?? "", notes: row.location?.notes ?? "" }); };
  const saveLocation = async () => {
    if (!editing || !selectedWarehouseId || saving) return;
    setSaving(true);
    try { await updateLocation({ productId: editing.product.id, warehouseId: selectedWarehouseId, section: form.section.trim() || null, shelf: form.shelf.trim() || null, notes: form.notes.trim() || null }); toast.success("Spare part location saved"); setEditing(null); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save spare part location"); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Workshop warehouse</p><h1 className="text-xl font-semibold tracking-tight">Spare part locator</h1><p className="mt-1 text-sm text-muted-foreground">Find the labelled section and shelf before entering the store area.</p></div><div className="flex items-center gap-2"><Warehouse className="size-5 text-primary" /><Select value={selectedWarehouseId} onValueChange={setWarehouseId}><SelectTrigger className="w-52"><SelectValue placeholder="Select warehouse" /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div></div>
    {!warehouses.length ? <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No active warehouses are available.</CardContent></Card> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock lines</p><p className="mt-1 text-2xl font-semibold">{rows.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations set</p><p className="mt-1 text-2xl font-semibold text-emerald-600">{locatedCount}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs labelling</p><p className="mt-1 text-2xl font-semibold text-amber-600">{rows.length - locatedCount}</p></CardContent></Card></div>
      <Card><CardHeader className="border-b py-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{payload?.warehouse?.name ?? "Warehouse stock"}</CardTitle><div className="flex flex-wrap items-center gap-2"><div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search product or shelf..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button variant={onlyUnassigned ? "default" : "outline"} size="sm" onClick={() => setOnlyUnassigned((value) => !value)}><AlertTriangle className="size-4" />Needs labelling</Button></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Spare part</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3">Section</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{filteredRows.map((row) => { const located = Boolean(row.location?.section || row.location?.shelf); const low = row.quantity > 0 && row.reorderLevel > 0 && row.quantity <= row.reorderLevel; return <tr key={row.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3"><p className="font-medium">{row.product.name}</p><p className="font-mono text-xs text-muted-foreground">{row.product.sku || "No SKU"}</p></td><td className="px-4 py-3 text-right tabular-nums">{row.quantity.toLocaleString()}</td><td className="px-4 py-3">{row.location?.section || <span className="text-muted-foreground">Not set</span>}</td><td className="px-4 py-3">{row.location?.shelf || <span className="text-muted-foreground">Not set</span>}</td><td className="max-w-[220px] px-4 py-3"><span className="block truncate text-xs text-muted-foreground" title={row.location?.notes ?? undefined}>{row.location?.notes || "—"}</span></td><td className="px-4 py-3">{located ? <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 size-3" />Located</Badge> : <Badge className="border border-amber-200 bg-amber-50 text-amber-700"><MapPin className="mr-1 size-3" />Needs label</Badge>}{low && <Badge variant="outline" className="ml-2">Low stock</Badge>}</td><td className="px-4 py-3 text-right">{canManage && <Button variant="ghost" size="icon" aria-label={`Set location for ${row.product.name}`} onClick={() => openEditor(row)}><Pencil className="size-4" /></Button>}</td></tr>; })}</tbody></table>{!filteredRows.length && <div className="py-14 text-center text-sm text-muted-foreground">{rows.length ? "No spare parts match this filter." : "No stock lines are recorded in this warehouse yet."}</div>}</div></CardContent></Card>
    </>}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Set spare part location</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{editing?.product.name}{editing?.product.sku ? ` · ${editing.product.sku}` : ""}</p><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Section</Label><Input value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} placeholder="e.g. Section A" /></div><div className="space-y-2"><Label>Shelf</Label><Input value={form.shelf} onChange={(event) => setForm({ ...form, shelf: event.target.value })} placeholder="e.g. Shelf A-03" /></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional placement note" /></div></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} onClick={() => void saveLocation()}>{saving ? "Saving..." : "Save location"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
