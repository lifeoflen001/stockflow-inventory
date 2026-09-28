import { useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { useApiQuery, useApiMutation } from "@/hooks/use-api.ts";
import { endpoints } from "@/api/endpoints.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "@/lib/system-message.ts";
import { Plus, Search, Users, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import type { EntityId } from "@/types/api.ts";
import { DataExchangeTools } from "@/components/data-exchange/data-exchange-tools.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type CustomerForm = {
  name: string; email: string; phone: string; address: string;
  city: string; country: string; taxId: string;
  customerType: "retail" | "wholesale"; creditLimit: string; discountRate: string;
};

const emptyForm: CustomerForm = {
  name: "", email: "", phone: "", address: "", city: "", country: "",
  taxId: "", customerType: "retail", creditLimit: "", discountRate: "0",
};

export default function CustomersPage() {
  const { user } = useAuth();
  const { confirm, confirmationDialog } = useConfirmation();
  const canManageMasterData = user?.role === "super_admin" || user?.permissions.includes("master_data.manage");
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<EntityId<"customers"> | null>(null);
  const [form, setForm] = useDraftState("customers", emptyForm);

  const customers = useApiQuery(endpoints.customers.listCustomers);
  const createCustomer = useApiMutation(endpoints.customers.createCustomer);
  const updateCustomer = useApiMutation(endpoints.customers.updateCustomer);
  const deleteCustomer = useApiMutation(endpoints.customers.deleteCustomer);

  if (customers === undefined) return <PageContentLoader variant="table" />;

  const filtered = (customers ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search),
  );

  const handleSave = async () => {
    if (!form.name) { toast.error("Customer name is required"); return; }
    const data = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      taxId: form.taxId || undefined,
      customerType: form.customerType,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
      discountRate: parseFloat(form.discountRate) || undefined,
    };
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...data });
        toast.success("Customer updated");
      } else {
        await createCustomer(data);
        toast.success("Customer created");
      }
      setShowDialog(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch {
      toast.error("Failed to save customer");
    }
  };

  const handleDelete = async (customer: NonNullable<typeof customers>[0]) => {
    if (!await confirm({ title: "Delete customer?", description: `Delete ${customer.name}? This cannot be undone.`, confirmLabel: "Delete Customer", destructive: true })) return;
    try {
      await deleteCustomer({ id: customer._id });
      toast.success("Customer deleted");
    } catch {
      toast.error("Unable to delete customer");
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Customers</h2>
          <p className="text-sm text-muted-foreground">{customers?.length ?? 0} active customers</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2"><DataExchangeTools /><Button onClick={() => { setForm(emptyForm); setEditingId(null); setShowDialog(true); }} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />Add Customer
        </Button></div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search customers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {customers === undefined ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No customers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Location</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Total Purchases</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr key={customer._id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{customer.name}</p>
                        {customer.discountRate ? <p className="text-xs text-green-600">{customer.discountRate}% discount</p> : null}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        <div>{customer.email ?? "—"}</div>
                        <div>{customer.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {[customer.city, customer.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={customer.customerType === "wholesale" ? "default" : "secondary"} className="text-xs capitalize">
                          {customer.customerType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm hidden md:table-cell">
                        ${customer.totalPurchases.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                         {canManageMasterData && <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer" onClick={() => {
                          setForm({
                            name: customer.name, email: customer.email ?? "", phone: customer.phone ?? "",
                            address: customer.address ?? "", city: customer.city ?? "", country: customer.country ?? "",
                            taxId: customer.taxId ?? "", customerType: customer.customerType,
                            creditLimit: customer.creditLimit?.toString() ?? "",
                            discountRate: customer.discountRate?.toString() ?? "0",
                          });
                          setEditingId(customer._id);
                          setShowDialog(true);
                         }}><Edit2 className="w-3 h-3" /></Button>}
                         {canManageMasterData && <Button variant="ghost" size="icon" className="w-7 h-7 cursor-pointer text-muted-foreground hover:text-destructive" title="Delete customer" onClick={() => void handleDelete(customer)}><Trash2 className="w-3 h-3" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Smith" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0000" /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.customerType} onValueChange={(v: "retail" | "wholesale") => setForm({ ...form, customerType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="retail">Retail</SelectItem><SelectItem value="wholesale">Wholesale</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Credit Limit</Label><Input type="number" step="100" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="0" /></div>
              <div className="space-y-1.5"><Label>Discount %</Label><Input type="number" step="0.5" value={form.discountRate} onChange={(e) => setForm({ ...form, discountRate: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Tax ID</Label><Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSave} className="cursor-pointer">Save Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
