import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import type { ManagedUser, Permission } from "@/types/admin.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

const EMPTY_USERS: ManagedUser[] = [];
const EMPTY_PERMISSIONS: Permission[] = [];
const permissionLabels: Record<string, string> = {
  "petty_cash.view": "View petty cash vouchers",
  "petty_cash.create": "Issue petty cash vouchers",
  "calendar.view": "View calendar events",
  "calendar.manage": "Create and manage calendar events",
  "departments.view": "View departments and structure",
  "departments.manage": "Manage departments and structure",
  "announcements.view": "View announcements",
  "announcements.manage": "Create and manage announcements",
};

function groupLabel(group: string) {
  return group.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function permissionLabel(permission: Permission) {
  return permissionLabels[permission.name] ?? permission.name.replaceAll(".", " · ").replaceAll("_", " ");
}

export default function UserAccessPage() {
  const usersResponse = useApiQuery(endpoints.administration.listUsers);
  const rolesResponse = useApiQuery(endpoints.administration.listRoles);
  const updateUser = useApiMutation(endpoints.administration.updateUser);
  const users = (usersResponse?.data ?? EMPTY_USERS) as ManagedUser[];
  const permissions = (rolesResponse?.data.permissions ?? EMPTY_PERMISSIONS) as Permission[];
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const selectedUser = users.find((user) => user.id === selectedId) ?? null;

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    return users.filter((user) => !value || `${user.name} ${user.email} ${user.role?.label ?? ""}`.toLowerCase().includes(value));
  }, [search, users]);

  const groups = useMemo(() => permissions.reduce<Record<string, Permission[]>>((result, permission) => {
    (result[permission.group] ??= []).push(permission);
    return result;
  }, {}), [permissions]);

  useEffect(() => {
    setPermissionIds(selectedUser ? permissions.filter((permission) => selectedUser.permissions.includes(permission.name)).map((permission) => permission.id) : []);
  }, [selectedUser, permissions]);

  if (!usersResponse || !rolesResponse) return <PageContentLoader variant="table" />;

  const openEditor = (user: ManagedUser) => {
    setSelectedId(user.id);
    setPermissionIds(permissions.filter((permission) => user.permissions.includes(permission.name)).map((permission) => permission.id));
  };

  const save = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await updateUser({ id: selectedUser.id, permission_ids: permissionIds });
      toast.success(`${selectedUser.name}'s access was updated`);
      setSelectedId(null);
    } catch {
      toast.error("Unable to update user permissions");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (items: Permission[]) => {
    const ids = items.map((permission) => permission.id);
    const allSelected = ids.every((id) => permissionIds.includes(id));
    setPermissionIds(allSelected ? permissionIds.filter((id) => !ids.includes(id)) : [...new Set([...permissionIds, ...ids])]);
  };

  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div>
      <p className="text-sm font-medium text-primary">Administration</p>
      <h1 className="text-xl font-semibold tracking-tight">User access</h1>
      <p className="mt-1 text-sm text-muted-foreground">Give or remove individual permissions without changing a user’s operational role.</p>
    </div>
    <Alert className="border-primary/15 bg-primary/[0.025]">
      <ShieldCheck />
      <AlertTitle>Role defaults with controlled exceptions</AlertTitle>
      <AlertDescription>Each user starts with permissions from their role. Changes here are user-specific, organization-scoped, and take effect across the application and API immediately.</AlertDescription>
    </Alert>
    <Card>
      <CardHeader className="border-b py-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Users and effective access</CardTitle><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search users..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Effective permissions</th><th className="px-4 py-3">Overrides</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-4" /></div><div><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div></div></td><td className="px-4 py-3"><Badge variant="secondary">{user.role?.label ?? "No role"}</Badge></td><td className="px-4 py-3"><span className="font-medium">{user.permissions.length}</span><span className="ml-1 text-xs text-muted-foreground">of {permissions.length}</span></td><td className="px-4 py-3">{user.permissionOverrides?.length ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{user.permissionOverrides.length} custom</Badge> : <span className="text-xs text-muted-foreground">Role defaults</span>}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openEditor(user)}><KeyRound className="size-4" />Edit access</Button></td></tr>)}</tbody></table>{!filteredUsers.length && <div className="py-14 text-center text-sm text-muted-foreground">No users match the search.</div>}</div></CardContent>
    </Card>
    <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedId(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Edit user access</DialogTitle><DialogDescription>{selectedUser?.name} · {selectedUser?.email}. Select the permissions this user should effectively have, regardless of their assigned role.</DialogDescription></DialogHeader><div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">{Object.entries(groups).map(([group, items]) => { const selected = items.filter((permission) => permissionIds.includes(permission.id)).length; return <section key={group} className="rounded-xl border bg-muted/20 p-3"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{groupLabel(group)}</p><p className="text-xs text-muted-foreground">{selected} of {items.length} enabled</p></div><Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(items)}>{selected === items.length ? "Clear all" : "Select all"}</Button></div><div className="grid gap-2 sm:grid-cols-2">{items.map((permission) => <label key={permission.id} className="flex items-start gap-2 rounded-lg border bg-background p-3 text-sm transition hover:border-primary/50"><Checkbox className="mt-0.5" checked={permissionIds.includes(permission.id)} onCheckedChange={(checked) => setPermissionIds(checked ? [...new Set([...permissionIds, permission.id])] : permissionIds.filter((id) => id !== permission.id))} /><span><span className="block font-medium capitalize">{permissionLabel(permission)}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{permission.name}</span></span></label>)}</div></section>; })}</div><DialogFooter><Button variant="outline" onClick={() => setSelectedId(null)}>Cancel</Button><Button onClick={save} disabled={saving}><Check className="size-4" />{saving ? "Saving..." : "Save access"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
