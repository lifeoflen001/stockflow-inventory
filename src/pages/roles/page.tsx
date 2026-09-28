import { useMemo, useState } from "react";
import { Check, Eye, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import type { Permission, Role } from "@/types/admin.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

const SYSTEM_ROLES = new Set(["super_admin", "procurement_manager", "procurement_officer", "store_keeper", "department_manager", "accountant", "supplier"]);
const EMPTY_ROLES: Role[] = [];
const EMPTY_PERMISSIONS: Permission[] = [];

const permissionLabels: Record<string, string> = {
  "inventory.view": "View inventory and products",
  "sales.view": "View sale history",
  "sales.create": "Use point of sale",
  "sales.void": "Void sales",
  "logistics.view": "View logistics and shipments",
  "logistics.manage": "Manage logistics and shipments",
  "petty_cash.view": "View petty cash vouchers",
  "petty_cash.create": "Issue petty cash vouchers",
  "requisitions.view": "View stock requisitions",
  "requisitions.create": "Create stock requisitions",
  "requisitions.approve": "Approve stock requisitions",
  "purchase_orders.issue": "Issue purchase orders to suppliers",
  "goods_receipts.view": "View goods receipts",
  "goods_receipts.create": "Create goods receipts",
  "goods_receipts.inspect": "Inspect received goods",
  "goods_receipts.post": "Post goods receipts",
  "stock.adjust": "Adjust stock balances",
  "stock.issue": "Issue stock",
  "stock.transfer.dispatch": "Dispatch stock transfers",
  "stock.transfer.receive": "Receive stock transfers",
  "stock.count": "Perform stock counts",
  "returns.approve": "Approve returns",
  "audit.view": "View audit history",
  "data.export": "Export data",
  "data.import": "Import data",
  "purchase_orders.view": "View purchase orders",
  "purchase_orders.create": "Create purchase orders",
  "purchase_orders.approve": "Approve purchase orders",
  "purchase_orders.payment_verify": "Verify payments and upload POP",
  "supplier_orders.view": "View company purchase orders",
  "supplier_orders.respond": "Respond to supplier orders",
  "supplier_documents.upload": "Upload supplier documents",
  "supplier_catalog.manage": "Manage supplier catalogue and prices",
  "customers.view": "View customers",
  "suppliers.view": "View suppliers",
  "locations.view": "View warehouses and organization",
  "locations.manage": "Manage warehouses and organization",
  "calendar.view": "View calendar events",
  "calendar.manage": "Create and manage calendar events",
  "departments.view": "View departments and structure",
  "departments.manage": "Manage departments and structure",
  "announcements.view": "View announcements",
  "announcements.manage": "Create and manage announcements",
  "reports.view": "View reports",
  "media.view": "View media library",
  "vehicles.view": "Search and view vehicles",
  "vehicles.manage": "Manage vehicles",
  "staff.view": "Search and view workshop staff",
  "staff.manage": "Manage workshop staff",
  "workshop.issues.view": "View workshop issue history",
  "workshop.issues.create": "Issue workshop spare parts",
  "users.view": "View users and roles",
  "users.manage": "Manage users",
  "roles.assign": "Assign roles and permissions",
  "master_data.manage": "Manage master data",
  "department.view": "Open department workspace",
  "department.orders.view": "View departmental orders",
  "department.orders.create": "Create departmental orders",
};

function permissionLabel(permission: Permission) {
  return permissionLabels[permission.name] ?? permission.name.replaceAll(".", " · ").replaceAll("_", " ");
}

function groupLabel(group: string) {
  return group.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RolesPage() {
  const { confirm, confirmationDialog } = useConfirmation();
  const { user } = useAuth();
  const canManageRoles = user?.role === "super_admin" || user?.permissions.includes("roles.assign");
  const response = useApiQuery(endpoints.administration.listRoles);
  const roles = response?.data.roles ?? EMPTY_ROLES;
  const permissions = response?.data.permissions ?? EMPTY_PERMISSIONS;
  const createRole = useApiMutation(endpoints.administration.createRole);
  const updateRole = useApiMutation(endpoints.administration.updateRole);
  const deleteRole = useApiMutation(endpoints.administration.deleteRole);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit" | "view"; role?: Role } | null>(null);
  const [label, setLabel] = useState("");
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const filtered = useMemo(() => roles.filter((role) => role.label.toLowerCase().includes(search.toLowerCase())), [roles, search]);
  const groups = useMemo(() => permissions.reduce<Record<string, Permission[]>>((all, permission) => {
    (all[permission.group] ??= []).push(permission);
    return all;
  }, {}), [permissions]);
  if (!response) return <PageContentLoader variant="table" />;
  const open = (mode: "create" | "edit" | "view", role?: Role) => {
    setLabel(role?.label ?? "");
    setPermissionIds(role?.permissions.map((permission) => permission.id) ?? []);
    setDialog({ mode, role });
  };
  const toggleGroup = (items: Permission[]) => {
    const ids = items.map((permission) => permission.id);
    const allSelected = ids.every((id) => permissionIds.includes(id));
    setPermissionIds(allSelected ? permissionIds.filter((id) => !ids.includes(id)) : [...new Set([...permissionIds, ...ids])]);
  };
  const save = async () => {
    if (!label.trim()) return toast.error("Role name is required");
    try {
      if (dialog?.mode === "edit" && dialog.role) await updateRole({ id: dialog.role.id, label: label.trim(), permission_ids: permissionIds });
      else await createRole({ label: label.trim(), permission_ids: permissionIds });
      toast.success(dialog?.mode === "edit" ? "Role updated" : "Role created");
      setDialog(null);
    } catch {
      toast.error("The role could not be saved");
    }
  };
  if (!response) return <div className="space-y-4 p-6"><Skeleton className="h-14 w-full" /><Skeleton className="h-64 w-full" /></div>;

  return <div className="space-y-4 p-6 pb-24 md:pb-6">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-xl font-semibold">Roles &amp; Permissions</h1><p className="text-sm text-muted-foreground">Control exactly which areas each role can see and use.</p></div>
      {canManageRoles && <Button onClick={() => open("create")}><Plus className="size-4" />Add Role</Button>}
    </div>
    <Card><CardContent className="flex items-center justify-between gap-4 p-3"><div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles..." /></div><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="size-4 text-primary" />Permissions apply to navigation and API access</div></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-muted-foreground"><tr><th className="w-12 px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Permissions</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map((role, index) => <tr key={role.id} className="border-t"><td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3 font-medium">{role.label}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{role.permissions.slice(0, 3).map((permission) => <Badge key={permission.id} variant="secondary" className="bg-blue-50 text-blue-700">{permissionLabel(permission)}</Badge>)}{role.permissions.length > 3 && <Badge variant="secondary">+{role.permissions.length - 3} more</Badge>}</div></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="View" onClick={() => open("view", role)}><Eye className="size-4" />{!canManageRoles && <span className="sr-only">View role</span>}</Button>{canManageRoles && <><Button variant="ghost" size="icon" title="Edit" onClick={() => open("edit", role)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" title="Delete" disabled={SYSTEM_ROLES.has(role.name)} onClick={async () => { if (!await confirm({ title: "Delete role?", description: `Delete ${role.label}? This cannot be undone.`, confirmLabel: "Delete Role", destructive: true })) return; try { await deleteRole({ id: role.id }); toast.success("Role deleted"); } catch { toast.error("Role is protected or assigned to users"); } }}><Trash2 className="size-4" /></Button></>}</div></td></tr>)}</tbody></table>{!filtered.length && <div className="py-12 text-center text-sm text-muted-foreground">No roles found</div>}<div className="flex justify-between border-t px-4 py-3 text-xs text-muted-foreground"><span>Showing 1 to {filtered.length} of {filtered.length} results</span><span>Rows per page: 10</span></div></div></CardContent></Card>
    <Dialog open={!!dialog} onOpenChange={(value) => !value && setDialog(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{dialog?.mode === "create" ? "Add Role" : dialog?.mode === "edit" ? "Edit Role" : "Role Details"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Role name</Label><Input value={label} disabled={dialog?.mode === "view" || (!!dialog?.role && SYSTEM_ROLES.has(dialog.role.name))} onChange={(event) => setLabel(event.target.value)} /></div><div className="max-h-[58vh] space-y-4 overflow-y-auto pr-2">{Object.entries(groups).map(([group, items]) => { const selected = items.filter((permission) => permissionIds.includes(permission.id)).length; return <section key={group} className="rounded-xl border bg-muted/20 p-3"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{groupLabel(group)}</p><p className="text-xs text-muted-foreground">{selected} of {items.length} enabled</p></div>{dialog?.mode !== "view" && <Button type="button" variant="outline" size="sm" onClick={() => toggleGroup(items)}>{selected === items.length ? "Clear all" : "Select all"}</Button>}</div><div className="grid gap-2 sm:grid-cols-2">{items.map((permission) => <label key={permission.id} className="flex items-start gap-2 rounded-lg border bg-background p-3 text-sm transition hover:border-primary/50"><Checkbox className="mt-0.5" disabled={dialog?.mode === "view"} checked={permissionIds.includes(permission.id)} onCheckedChange={(checked) => setPermissionIds(checked ? [...new Set([...permissionIds, permission.id])] : permissionIds.filter((id) => id !== permission.id))} /><span><span className="block font-medium">{permissionLabel(permission)}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{permission.name}</span></span></label>)}</div></section>; })}</div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Close</Button>{dialog?.mode !== "view" && <Button onClick={save}><Check className="size-4" />Save Role</Button>}</DialogFooter></DialogContent></Dialog>
    {confirmationDialog}
  </div>;
}
