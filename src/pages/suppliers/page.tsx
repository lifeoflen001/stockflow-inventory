import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import {
  Plus, Search, Building2, Edit2, Eye, Star, Phone, Mail,
  MapPin, X, Trash2, TrendingUp, ShoppingBag, DollarSign, AlertCircle, AlertTriangle,
} from "lucide-react";
import type { EntityId } from "@/types/api.ts";
import { DataExchangeTools } from "@/components/data-exchange/data-exchange-tools.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type SupplierForm = {
  name: string; contactPerson: string; email: string; phone: string;
  address: string; city: string; country: string; taxId: string; tin: string; vrn: string;
  paymentTerms: string; notes: string; rating: string;
};

const EMPTY_FORM: SupplierForm = {
  name: "", contactPerson: "", email: "", phone: "",
  address: "", city: "", country: "", taxId: "", tin: "", vrn: "",
  paymentTerms: "Net 30", notes: "", rating: "5",
};

const PAYMENT_TERMS = ["Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "COD", "Prepaid"];

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value: unknown): string {
  return value == null ? "" : String(value);
}

function StarRating({ value }: { value: number }) {
  const rating = safeNumber(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn("w-3 h-3", star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function SuppliersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageMasterData = user?.role === "super_admin" || user?.permissions.includes("master_data.manage");
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<EntityId<"suppliers"> | null>(null);
  const [form, setForm] = useDraftState("suppliers", EMPTY_FORM);
  const [selectedSupplierId, setSelectedSupplierId] = useState<EntityId<"suppliers"> | null>(null);
  const [profileSupplierId, setProfileSupplierId] = useState<EntityId<"suppliers"> | null>(null);

  const suppliers = useApiQuery(endpoints.suppliers.listSuppliers);
  const [deleteTarget, setDeleteTarget] = useState<NonNullable<typeof suppliers>[number] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const supplierStats = useApiQuery(
    endpoints.procurement.getSupplierStats,
    selectedSupplierId ? { supplierId: selectedSupplierId } : "skip",
  );
  const totalOrders = safeNumber(supplierStats?.totalOrders);
  const totalSpend = safeNumber(supplierStats?.totalSpend);
  const totalPaid = safeNumber(supplierStats?.totalPaid);
  const outstanding = safeNumber(supplierStats?.outstanding);
  const createSupplier = useApiMutation(endpoints.suppliers.createSupplier);
  const updateSupplier = useApiMutation(endpoints.suppliers.updateSupplier);
  const deleteSupplier = useApiMutation(endpoints.suppliers.deleteSupplier);

  if (suppliers === undefined) return <PageContentLoader variant="table" />;

  const filtered = (suppliers ?? []).filter(
    (s) =>
      safeText(s.name).toLowerCase().includes(search.toLowerCase()) ||
      safeText(s.contactPerson).toLowerCase().includes(search.toLowerCase()) ||
      safeText(s.email).toLowerCase().includes(search.toLowerCase()) ||
      safeText(s.tin ?? s.taxId).toLowerCase().includes(search.toLowerCase()) ||
      safeText(s.vrn).toLowerCase().includes(search.toLowerCase()) ||
      safeText(s.city).toLowerCase().includes(search.toLowerCase()),
  );

  const openEdit = (s: NonNullable<typeof suppliers>[0]) => {
    setForm({
      name: s.name, contactPerson: s.contactPerson ?? "", email: s.email ?? "",
      phone: s.phone ?? "", address: s.address ?? "", city: s.city ?? "",
      country: s.country ?? "", taxId: s.taxId ?? "", tin: s.tin ?? s.taxId ?? "", vrn: s.vrn ?? "",
      paymentTerms: s.paymentTerms ?? "Net 30",
      notes: s.notes ?? "", rating: s.rating?.toString() ?? "5",
    });
    setEditingId(s._id);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Supplier name is required"); return; }
    const data = {
      name: form.name,
      contactPerson: form.contactPerson || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      taxId: form.taxId || undefined,
      tin: form.tin || undefined,
      vrn: form.vrn || undefined,
      paymentTerms: form.paymentTerms || undefined,
      notes: form.notes || undefined,
      rating: parseFloat(form.rating) || undefined,
    };
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, ...data });
        toast.success("Supplier updated");
      } else {
        await createSupplier(data);
        toast.success("Supplier added");
      }
      setShowDialog(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch {
      toast.error("Failed to save supplier");
    }
  };

  const selectedSupplier = (suppliers ?? []).find((s) => s._id === selectedSupplierId);
  const profileSupplier = (suppliers ?? []).find((s) => s._id === profileSupplierId);
  const openProfile = (supplier: NonNullable<typeof suppliers>[0]) => {
    setSelectedSupplierId(supplier._id);
    navigate(`/suppliers/${supplier._id}`);
  };

  const handleDelete = async (mode: "keep_history" | "delete_history") => {
    const supplier = deleteTarget;
    if (!supplier) return;
    setDeleteBusy(true);
   try {
     if (selectedSupplierId === supplier._id) setSelectedSupplierId(null);
     if (profileSupplierId === supplier._id) setProfileSupplierId(null);
      await deleteSupplier({ id: supplier._id, mode });
      setDeleteTarget(null);
      toast.success(mode === "delete_history" ? "Supplier and purchase-order history deleted" : "Supplier deleted; purchase-order history kept");
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to delete supplier"));
    } finally {
      setDeleteBusy(false);
   }
 };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main panel */}
      <div className={cn("flex flex-col flex-1 min-w-0", selectedSupplierId ? "lg:mr-80" : "")}>
        <div className="p-5 space-y-5 overflow-y-auto pb-24 md:pb-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Suppliers</h2>
              <p className="text-sm text-muted-foreground">
                {suppliers?.length ?? 0} suppliers · {(suppliers ?? []).filter((s) => s.isActive).length} active
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2"><DataExchangeTools />{canManageMasterData && <Button
              onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowDialog(true); }}
              className="cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" />Add Supplier
            </Button>}</div>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, contact, city…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {suppliers === undefined ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No suppliers found</p>
                  {canManageMasterData && <Button
                    variant="ghost" size="sm" className="mt-2 cursor-pointer"
                    onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowDialog(true); }}
                  >
                    Add your first supplier
                  </Button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">TIN</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">VRN</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Location</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Terms</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Rating</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((supplier) => (
                        <tr
                          key={supplier._id}
                          className={cn(
                            "border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer",
                            selectedSupplierId === supplier._id && "bg-accent/30",
                          )}
                          onClick={() => setSelectedSupplierId(selectedSupplierId === supplier._id ? null : supplier._id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{supplier.name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell font-mono text-xs whitespace-nowrap">{supplier.tin ?? supplier.taxId ?? "—"}</td>
                          <td className="px-4 py-3 hidden md:table-cell font-mono text-xs whitespace-nowrap">{supplier.vrn ?? "—"}</td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="space-y-0.5">
                              {supplier.contactPerson && (
                                <p className="text-sm">{supplier.contactPerson}</p>
                              )}
                              {supplier.email && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="w-3 h-3" />{supplier.email}
                                </p>
                              )}
                              {supplier.phone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="w-3 h-3" />{supplier.phone}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {(supplier.city || supplier.country) && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                {[supplier.city, supplier.country].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {supplier.paymentTerms && (
                              <Badge variant="secondary" className="text-xs">{supplier.paymentTerms}</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {supplier.rating && <StarRating value={supplier.rating} />}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={cn("text-xs", supplier.isActive
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            )}>
                              {supplier.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                title="View supplier profile"
                                onClick={() => openProfile(supplier)}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              {canManageMasterData && <Button
                                variant="ghost" size="icon" className="w-7 h-7 cursor-pointer"
                                onClick={() => openEdit(supplier)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>}
                               {canManageMasterData && <Button
                                 variant="ghost" size="icon"
                                 className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive"
                                 title="Delete supplier"
                                 aria-label={`Delete ${supplier.name}`}
                                 onClick={() => setDeleteTarget(supplier)}
                               >
                                 <Trash2 className="w-3 h-3" />
                               </Button>}
    </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(profileSupplier)} onOpenChange={(open) => { if (!open) setProfileSupplierId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Supplier Profile</DialogTitle></DialogHeader>
          {profileSupplier && <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6 text-primary" /></div>
              <div className="min-w-0"><p className="font-semibold text-lg truncate">{profileSupplier.name}</p><p className="text-xs text-muted-foreground">{profileSupplier.contactPerson || "Supplier contact"}</p>{profileSupplier.rating !== undefined && <StarRating value={profileSupplier.rating} />}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">TIN</p><p className="mt-1 font-mono font-semibold break-all">{profileSupplier.tin ?? profileSupplier.taxId ?? "—"}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">VRN</p><p className="mt-1 font-mono font-semibold break-all">{profileSupplier.vrn ?? "—"}</p></div>
            </div>
            <div className="space-y-2 text-sm">
              {profileSupplier.email && <p><span className="text-muted-foreground">Email: </span>{profileSupplier.email}</p>}
              {profileSupplier.phone && <p><span className="text-muted-foreground">Phone: </span>{profileSupplier.phone}</p>}
              {(profileSupplier.address || profileSupplier.city || profileSupplier.country) && <p><span className="text-muted-foreground">Address: </span>{[profileSupplier.address, profileSupplier.city, profileSupplier.country].filter(Boolean).join(", ")}</p>}
              {profileSupplier.paymentTerms && <p><span className="text-muted-foreground">Payment terms: </span>{profileSupplier.paymentTerms}</p>}
            </div>
            {profileSupplier.notes && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{profileSupplier.notes}</p>}
            {supplierStats && <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><p className="text-xs text-muted-foreground">Total orders</p><p className="font-semibold">{totalOrders}</p></div><div><p className="text-xs text-muted-foreground">Total spend</p><p className="font-semibold">{totalSpend.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Total paid</p><p className="font-semibold">{totalPaid.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-semibold">{outstanding.toLocaleString()}</p></div></div>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setProfileSupplierId(null)}>Close</Button>{canManageMasterData && profileSupplier && <Button onClick={() => { setProfileSupplierId(null); openEdit(profileSupplier); }}><Edit2 className="mr-2 h-4 w-4" />Edit Supplier</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier detail panel */}
      {selectedSupplierId && selectedSupplier && (
        <div className="hidden lg:flex lg:fixed lg:right-0 lg:top-14 lg:bottom-0 lg:w-80 flex-col border-l border-border bg-card overflow-y-auto z-10">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Supplier Details</h3>
            <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer" onClick={() => setSelectedSupplierId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-4 space-y-5">
            {/* Identity */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{selectedSupplier.name}</p>
                {selectedSupplier.contactPerson && (
                  <p className="text-xs text-muted-foreground">{selectedSupplier.contactPerson}</p>
                )}
                {selectedSupplier.rating && <StarRating value={selectedSupplier.rating} />}
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-2">
              {selectedSupplier.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a href={`mailto:${selectedSupplier.email}`} className="text-primary hover:underline truncate text-xs">
                    {selectedSupplier.email}
                  </a>
                </div>
              )}
              {selectedSupplier.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs">{selectedSupplier.phone}</span>
                </div>
              )}
              {(selectedSupplier.city || selectedSupplier.country) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs">{[selectedSupplier.address, selectedSupplier.city, selectedSupplier.country].filter(Boolean).join(", ")}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {selectedSupplier.paymentTerms && (
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-muted-foreground">Payment Terms</p>
                  <p className="font-semibold mt-0.5">{selectedSupplier.paymentTerms}</p>
                </div>
              )}
              {(selectedSupplier.tin ?? selectedSupplier.taxId) && (
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-muted-foreground">TIN</p>
                  <p className="font-semibold font-mono mt-0.5">{selectedSupplier.tin ?? selectedSupplier.taxId}</p>
                </div>
              )}
              {selectedSupplier.vrn && (
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-muted-foreground">VRN</p>
                  <p className="font-semibold font-mono mt-0.5">{selectedSupplier.vrn}</p>
                </div>
              )}
            </div>

            {selectedSupplier.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 italic">
                {selectedSupplier.notes}
              </p>
            )}

            <Separator />

            {/* Purchase stats */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Purchase History</p>
              {supplierStats === undefined ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Total Orders", value: totalOrders.toString(), icon: ShoppingBag, color: "text-blue-600" },
                    { label: "Total Spend", value: `$${totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: "text-green-600" },
                    { label: "Total Paid", value: `$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-green-600" },
                    { label: "Outstanding", value: `$${outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: AlertCircle, color: outstanding > 0 ? "text-amber-600" : "text-muted-foreground" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-muted/40 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <stat.icon className={cn("w-3 h-3", stat.color)} />
                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      </div>
                      <p className="text-sm font-bold">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {canManageMasterData && <Button className="w-full cursor-pointer" variant="secondary" onClick={() => openEdit(selectedSupplier)}>
              <Edit2 className="w-3 h-3 mr-2" />Edit Supplier
            </Button>}
          </div>
        </div>
      )}

      {/* ── Supplier Dialog ─────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@supplier.com" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+255 ..." />
              </div>
              <div className="space-y-1.5">
                <Label>TIN</Label>
                <Input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} placeholder="TIN number" />
              </div>
              <div className="space-y-1.5">
                <Label>VRN</Label>
                <Input value={form.vrn} onChange={(e) => setForm({ ...form, vrn: e.target.value })} placeholder="VRN number" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="New York" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="USA" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {PAYMENT_TERMS.map((term) => (
                    <button
                      key={term}
                      onClick={() => setForm({ ...form, paymentTerms: term })}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer",
                        form.paymentTerms === term
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rating (1–5)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setForm({ ...form, rating: n.toString() })}
                      className="cursor-pointer"
                    >
                      <Star className={cn("w-5 h-5 transition-colors", n <= parseFloat(form.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300")} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes about this supplier…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSave} className="cursor-pointer">
              {editingId ? "Update Supplier" : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleteTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-7" />
            </div>
            <DialogTitle className="text-center">Delete supplier?</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            Choose what should happen to purchase orders and related history for <span className="font-medium text-foreground">{deleteTarget?.name}</span>.
          </p>
          <div className="grid gap-3">
            <Button variant="outline" className="h-auto justify-start whitespace-normal p-4 text-left" disabled={deleteBusy} onClick={() => void handleDelete("keep_history")}>
              <span><span className="block font-semibold">Delete supplier, keep PO history</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Purchase orders, payments, receipts, documents and comments remain available.</span></span>
            </Button>
            <Button variant="destructive" className="h-auto justify-start whitespace-normal p-4 text-left" disabled={deleteBusy} onClick={() => void handleDelete("delete_history")}>
              <span><span className="block font-semibold">Delete supplier and all PO history</span><span className="mt-1 block text-xs font-normal text-destructive-foreground/80">Permanently removes the supplier and all of its purchase-order records.</span></span>
            </Button>
          </div>
          <DialogFooter><Button variant="ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
