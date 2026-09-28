import { useMemo, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { ClipboardList, Clock3, PackageCheck, Plus, Search, Send, WalletCards, type LucideIcon } from "lucide-react";
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

type Department = { id: number; name: string; code: string; branch?: string };
type DepartmentOrder = { id: string; reference: string; status: string; quantity: number; reason?: string | null; notes?: string | null; createdAt?: string | null; product?: { name?: string | null; sku?: string | null } | null; warehouse?: { name?: string | null } | null; requestedBy?: string | null };
type PurchaseOrder = { id: string; poNumber: string; status: string; totalAmount: number; expectedDate?: string | null; supplier?: { name?: string | null } | null; warehouse?: { name?: string | null } | null };
type WorkspaceResponse = { department?: Department | null; summary?: Record<string, number>; orders?: DepartmentOrder[]; purchaseOrders?: PurchaseOrder[] };
const EMPTY_DEPARTMENT_ORDERS: DepartmentOrder[] = [];

const statusClass: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700", approved: "border-blue-200 bg-blue-50 text-blue-700", draft: "border-slate-200 bg-slate-50 text-slate-700", sent: "border-blue-200 bg-blue-50 text-blue-700", confirmed: "border-violet-200 bg-violet-50 text-violet-700", partial: "border-amber-200 bg-amber-50 text-amber-700", received: "border-emerald-200 bg-emerald-50 text-emerald-700", cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

const statusBadge = (status: string) => <Badge variant="outline" className={`capitalize ${statusClass[status] ?? ""}`}>{status}</Badge>;

export default function DepartmentWorkspacePage() {
  const { user } = useAuth();
  const departmentsResponse = useApiQuery(endpoints.organizationStructure.listDepartments);
  const departments = (departmentsResponse?.data ?? []) as Department[];
  const canChooseDepartment = user?.role === "super_admin";
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const activeDepartmentId = selectedDepartmentId || user?.department?.id || (canChooseDepartment ? String(departments[0]?.id ?? "") : "");
  const response = useApiQuery(endpoints.departmentWorkspace.get, activeDepartmentId ? { departmentId: activeDepartmentId } : {});
  const products = useApiQuery(endpoints.inventory.listProducts, { includeInactive: false }) ?? [];
  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses) ?? [];
  const createOrder = useApiMutation(endpoints.departmentWorkspace.createOrder);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useDraftState("department-workspace-request", { productId: "", warehouseId: "", quantity: "1", reason: "", notes: "" });
  const payload = response as WorkspaceResponse | undefined;
  const orders = payload?.orders ?? EMPTY_DEPARTMENT_ORDERS;
  const purchaseOrders = payload?.purchaseOrders ?? [];
  const filteredOrders = useMemo(() => {
    const value = search.trim().toLowerCase();
    return orders.filter((order) => !value || `${order.reference} ${order.product?.name ?? ""} ${order.product?.sku ?? ""} ${order.status}`.toLowerCase().includes(value));
  }, [orders, search]);
  const summary = payload?.summary ?? {};
  const money = (value: number) => `TSHS ${Number(value || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const metrics: Array<{ label: string; value: string | number; icon: LucideIcon; tone: string }> = [
    { label: "Open requests", value: summary.pendingOrders ?? 0, icon: Clock3, tone: "text-amber-600" },
    { label: "Approved requests", value: summary.approvedOrders ?? 0, icon: ClipboardList, tone: "text-blue-600" },
    { label: "Open POs", value: summary.openPurchaseOrders ?? 0, icon: Send, tone: "text-violet-600" },
    { label: "Received POs", value: summary.receivedOrders ?? 0, icon: PackageCheck, tone: "text-emerald-600" },
    { label: "Committed spend", value: money(summary.committedSpend ?? 0), icon: WalletCards, tone: "text-primary" },
  ];

  if (departmentsResponse === undefined || response === undefined) return <PageContentLoader variant="table" />;

  const submitOrder = async () => {
    if (!activeDepartmentId || !form.productId || !form.warehouseId || Number(form.quantity) <= 0) return toast.error("Select a product, warehouse and valid quantity");
    setSaving(true);
    try {
      await createOrder({ departmentId: Number(activeDepartmentId), productId: Number(form.productId), warehouseId: Number(form.warehouseId), quantity: Number(form.quantity), reason: form.reason.trim() || undefined, notes: form.notes.trim() || undefined });
      toast.success("Departmental order submitted");
      setOpen(false);
      setForm({ productId: "", warehouseId: "", quantity: "1", reason: "", notes: "" });
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to submit departmental order"); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Department workspace</p><h1 className="text-xl font-semibold tracking-tight">Departmental orders</h1><p className="mt-1 text-sm text-muted-foreground">Raise stock requirements, follow procurement progress and keep your department informed.</p></div><div className="flex flex-wrap items-center gap-2">{canChooseDepartment && <Select value={activeDepartmentId} onValueChange={setSelectedDepartmentId}><SelectTrigger className="w-52"><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name} · {department.code}</SelectItem>)}</SelectContent></Select>}{user?.permissions.includes("department.orders.create") && <Button disabled={!payload?.department} onClick={() => setOpen(true)}><Plus className="size-4" />New departmental order</Button>}</div></div>
    {!payload?.department ? <Card><CardContent className="py-16 text-center"><ClipboardList className="mx-auto mb-3 size-10 text-primary/35" /><h2 className="font-semibold">Department assignment required</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Ask a Super Admin to assign this account to an active department before raising or viewing departmental orders.</p></CardContent></Card> : <>
      <Card className="border-primary/15 bg-primary/[0.025]"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current department</p><p className="mt-1 text-lg font-semibold">{payload.department.name} <span className="text-sm font-normal text-muted-foreground">· {payload.department.code}</span></p><p className="text-xs text-muted-foreground">{payload.department.branch || "Organization department"}</p></div><Badge variant="outline" className="border-primary/20 bg-background text-primary">Department workspace</Badge></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(({ label, value, icon: Icon, tone }) => <Card key={label}><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div><Icon className={`size-5 ${tone}`} /></CardContent></Card>)}</div>
      <Card><CardHeader className="border-b py-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Department order requests</CardTitle><div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search reference or item..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3 font-mono text-xs font-semibold">{order.reference}</td><td className="px-4 py-3"><p className="font-medium">{order.product?.name ?? "Unknown item"}</p><p className="font-mono text-[11px] text-muted-foreground">{order.product?.sku ?? "No SKU"}</p></td><td className="px-4 py-3 text-right tabular-nums">{order.quantity}</td><td className="px-4 py-3 text-xs text-muted-foreground">{order.warehouse?.name ?? "—"}</td><td className="px-4 py-3">{statusBadge(order.status)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{order.requestedBy ?? "—"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{order.createdAt?.slice(0, 10) ?? "—"}</td></tr>)}</tbody></table>{!filteredOrders.length && <div className="py-14 text-center text-sm text-muted-foreground">No departmental orders recorded yet.</div>}</div></CardContent></Card>
      <Card><CardHeader className="border-b py-4"><CardTitle className="text-base">Procurement progress</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">PO number</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3 text-right">Committed</th></tr></thead><tbody>{purchaseOrders.map((order) => <tr key={order.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3 font-mono text-xs font-semibold">{order.poNumber}</td><td className="px-4 py-3">{order.supplier?.name ?? "—"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{order.warehouse?.name ?? "—"}</td><td className="px-4 py-3">{statusBadge(order.status)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{order.expectedDate ?? "—"}</td><td className="px-4 py-3 text-right font-mono text-xs">{money(order.totalAmount)}</td></tr>)}</tbody></table>{!purchaseOrders.length && <div className="py-14 text-center text-sm text-muted-foreground">No purchase orders have been allocated to this department.</div>}</div></CardContent></Card>
    </>}
    <Dialog open={open} onOpenChange={(value) => !value && !saving && setOpen(false)}><DialogContent><DialogHeader><DialogTitle>New departmental order</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Submit a stock requirement for procurement review. This does not change warehouse stock.</p><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Spare part *</Label><Select value={form.productId} onValueChange={(value) => setForm({ ...form, productId: value })}><SelectTrigger><SelectValue placeholder="Select spare part" /></SelectTrigger><SelectContent>{(products as Array<Record<string, unknown>>).map((product) => <SelectItem key={String(product._id)} value={String(product._id)}>{String(product.name)} · {String(product.sku ?? "No SKU")}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Receiving warehouse *</Label><Select value={form.warehouseId} onValueChange={(value) => setForm({ ...form, warehouseId: value })}><SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger><SelectContent>{(warehouses as Array<Record<string, unknown>>).map((warehouse) => <SelectItem key={String(warehouse._id)} value={String(warehouse._id)}>{String(warehouse.name)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Quantity *</Label><Input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Reason</Label><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Why does the department need this item?" /></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Additional specification or delivery note" /></div></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void submitOrder()}>{saving ? "Submitting..." : "Submit order"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
