import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { Eye, Grid2X2, KeyRound, List, Lock, Mail, Pencil, Plus, Search, Trash2, Unlock } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { endpoints } from "@/api/endpoints.ts";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { useConfirmation } from "@/hooks/use-confirmation.tsx";
import type { ManagedUser, Role } from "@/types/admin.ts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

const EMPTY_USERS: ManagedUser[] = [];
const EMPTY_ROLES: Role[] = [];

function dateTime(value: string | null | undefined) {
  return value ? format(parseISO(value), "yyyy-MM-dd HH:mm") : "Never";
}

function userRoles(user: ManagedUser) {
  return user.roles?.length ? user.roles : user.role ? [user.role] : [];
}

export default function UsersManagementPage() {
  const { confirm, confirmationDialog } = useConfirmation();
  const usersResponse = useApiQuery(endpoints.administration.listUsers);
  const rolesResponse = useApiQuery(endpoints.administration.listRoles);
  const users = usersResponse?.data ?? EMPTY_USERS;
  const roles = rolesResponse?.data.roles ?? EMPTY_ROLES;
  const suppliers = useApiQuery(endpoints.suppliers.listSuppliers) ?? [];
  const updateUser = useApiMutation(endpoints.administration.updateUser);
  const deleteUser = useApiMutation(endpoints.administration.deleteUser);
  const createInvitation = useApiMutation(endpoints.administration.createInvitation);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [grid, setGrid] = useState(false);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", roleId: "", departmentId: "", supplierId: "" });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const filtered = useMemo(() => users.filter((user) => (roleFilter === "all" || userRoles(user).some((role) => String(role.id) === roleFilter)) && `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [users, search, roleFilter]);

  const changeRole = async (user: ManagedUser, roleId: string) => {
    try { await updateUser({ id: user.id, role_id: Number(roleId) }); toast.success("User role updated"); setSelected(null); }
    catch { toast.error("Unable to update user"); }
  };
  const sendInvite = async () => {
    if (inviteSubmitting) return;
    if (!invite.email || !invite.roleId) return toast.error("Email and role are required");
    const selectedRole = roles.find((role) => String(role.id) === invite.roleId);
    if (selectedRole?.name === "supplier" && !invite.supplierId) return toast.error("Select the supplier company for this invitation");
    setInviteSubmitting(true);
    try {
      const response = await createInvitation({ email: invite.email, role_id: Number(invite.roleId), department_id: invite.departmentId === "none" ? null : (invite.departmentId ? Number(invite.departmentId) : null), supplier_id: invite.supplierId ? Number(invite.supplierId) : null });
      toast.success(response?.data?.message ?? "Invitation email sent");
      setInviteOpen(false);
      setInvite({ email: "", roleId: "", departmentId: "", supplierId: "" });
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to send invitation"));
    }
    finally { setInviteSubmitting(false); }
  };

if (!usersResponse || !rolesResponse) return <PageContentLoader variant="table" />;

  const actions = (user: ManagedUser) => <div className="flex justify-end gap-1">
    <Button variant="ghost" size="icon" title="View" onClick={() => setSelected(user)}><Eye className="size-4" /></Button>
    <Button variant="ghost" size="icon" title="Edit role" onClick={() => setSelected(user)}><Pencil className="size-4" /></Button>
    <Button variant="ghost" size="icon" title="Send password reset" onClick={async () => { await apiClient.post("/auth/forgot-password", { email: user.email }); toast.success("Password reset email requested"); }}><KeyRound className="size-4" /></Button>
    <Button variant="ghost" size="icon" title={user.isActive ? "Disable" : "Enable"} onClick={async () => { try { await updateUser({ id: user.id, is_active: !user.isActive }); toast.success(user.isActive ? "User disabled" : "User enabled"); } catch { toast.error("Unable to update status"); } }}>{user.isActive ? <Lock className="size-4" /> : <Unlock className="size-4" />}</Button>
    <Button variant="ghost" size="icon" title="Delete" onClick={async () => { if (!await confirm({ title: "Delete user?", description: `Delete ${user.name}? This cannot be undone.`, confirmLabel: "Delete User", destructive: true })) return; try { await deleteUser({ id: user.id }); toast.success("User deleted"); } catch { toast.error("This user cannot be deleted"); } }}><Trash2 className="size-4" /></Button>
  </div>;

  return <div className="space-y-4 p-6 pb-24 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Users Management</h1><p className="text-sm text-muted-foreground">Manage all {users.length} users in this organization, including roles, permissions, and account activity.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link to="/user-access"><KeyRound className="size-4" />User Access</Link></Button><Button onClick={() => setInviteOpen(true)}><Plus className="size-4" />Add User</Button></div></div>
    <Card><CardContent className="flex flex-wrap items-center gap-2 p-3"><div className="relative w-60"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Roles</SelectItem>{roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.label}</SelectItem>)}</SelectContent></Select><div className="ml-auto flex rounded-md border p-0.5"><Button size="icon" variant={!grid ? "default" : "ghost"} className="size-8" onClick={() => setGrid(false)}><List className="size-4" /></Button><Button size="icon" variant={grid ? "default" : "ghost"} className="size-8" onClick={() => setGrid(true)}><Grid2X2 className="size-4" /></Button></div></CardContent></Card>
    {grid ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((user) => <Card key={user.id}><CardContent className="p-4"><div className="flex items-center gap-3"><Avatar><AvatarImage src={user.avatarUrl ?? undefined} /><AvatarFallback>{user.name[0]}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate font-medium">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><Badge variant={user.isActive ? "default" : "secondary"}>{user.isActive ? "Active" : "Inactive"}</Badge></div><div className="mt-3 space-y-2 border-t pt-3"><div className="flex flex-wrap gap-1">{userRoles(user).map((role) => <Badge key={role.id} variant="secondary">{role.label}</Badge>)}</div><p className="text-xs text-muted-foreground">{user.permissions.length} permissions · Last active: {dateTime(user.lastActiveAt)}</p><div className="border-t pt-2">{actions(user)}</div></div></CardContent></Card>)}</div> : <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-muted-foreground"><tr><th className="w-12 px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Roles</th><th className="px-4 py-3 text-left">Permissions</th><th className="px-4 py-3 text-left">Joined</th><th className="px-4 py-3 text-left">Last active</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map((user, index) => <tr key={user.id} className="border-t"><td className="px-4 py-3">{index + 1}</td><td className="px-4 py-2"><div className="flex items-center gap-3"><Avatar className="size-9"><AvatarImage src={user.avatarUrl ?? undefined} /><AvatarFallback>{user.name[0]}</AvatarFallback></Avatar><div><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div></div></td><td className="px-4 py-3"><div className="flex max-w-48 flex-wrap gap-1">{userRoles(user).length ? userRoles(user).map((role) => <Badge key={role.id} variant="secondary" className="bg-blue-50 text-blue-700">{role.label}</Badge>) : <Badge variant="outline">No role</Badge>}</div></td><td className="px-4 py-3"><div className="flex max-w-72 flex-wrap gap-1">{user.permissions.length ? <>{user.permissions.slice(0, 4).map((permission) => <Badge key={permission} variant="outline" className="text-xs">{permission}</Badge>)}{user.permissions.length > 4 && <Badge variant="secondary">+{user.permissions.length - 4}</Badge>}</> : <span className="text-muted-foreground">None</span>}</div></td><td className="px-4 py-3 text-muted-foreground">{user.joinedAt ? format(parseISO(user.joinedAt), "yyyy-MM-dd") : "—"}</td><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateTime(user.lastActiveAt)}</td><td className="px-4 py-3">{actions(user)}</td></tr>)}</tbody></table>{!filtered.length && <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>}<div className="flex justify-between border-t px-4 py-3 text-xs text-muted-foreground"><span>Showing {filtered.length} of {users.length} users</span><span>{filtered.length === users.length ? "All users" : "Filtered view"}</span></div></div></CardContent></Card>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="flex items-center gap-3"><Avatar className="size-12"><AvatarImage src={selected.avatarUrl ?? undefined} /><AvatarFallback>{selected.name[0]}</AvatarFallback></Avatar><div><p className="font-medium">{selected.name}</p><p className="text-sm text-muted-foreground">{selected.email}</p></div></div><div className="space-y-2"><Label>Role</Label><Select value={String(selected.role?.id ?? "")} onValueChange={(value) => changeRole(selected, value)}><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Permissions</Label><div className="mt-2 flex flex-wrap gap-1">{selected.permissions.map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}</div></div><p className="text-sm text-muted-foreground">Status: {selected.isActive ? "Active" : "Disabled"} · Last active: {dateTime(selected.lastActiveAt)}</p></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={(open) => { if (!inviteSubmitting) setInviteOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Send a secure invitation so the user can set their own password.</p><div className="space-y-4"><div className="space-y-2"><Label>Email address</Label><Input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} disabled={inviteSubmitting} /></div><div className="space-y-2"><Label>Role</Label><Select value={invite.roleId} onValueChange={(roleId) => setInvite({ ...invite, roleId, supplierId: roles.find((role) => String(role.id) === roleId)?.name === "supplier" ? invite.supplierId : "" })} disabled={inviteSubmitting}><SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.label}</SelectItem>)}</SelectContent></Select></div>{roles.find((role) => String(role.id) === invite.roleId)?.name === "supplier" && <div className="space-y-2"><Label>Supplier company</Label><Select value={invite.supplierId} onValueChange={(supplierId) => setInvite({ ...invite, supplierId })} disabled={inviteSubmitting}><SelectTrigger><SelectValue placeholder="Choose supplier company" /></SelectTrigger><SelectContent>{(suppliers as any[]).map((supplier) => <SelectItem key={supplier._id} value={String(supplier._id)}>{supplier.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">This limits the user to orders and documents belonging to this company.</p></div>}</div><DialogFooter><Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSubmitting}>Cancel</Button><Button onClick={sendInvite} disabled={inviteSubmitting}>{inviteSubmitting ? <><Mail className="size-4 animate-pulse" />Sending...</> : <><Mail className="size-4" />Send Invitation</>}</Button></DialogFooter></DialogContent></Dialog>
    {confirmationDialog}
  </div>;
}
