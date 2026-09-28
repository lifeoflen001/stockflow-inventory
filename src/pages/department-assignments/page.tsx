import { useMemo, useState } from "react";
import { Building2, Search, Users } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import type { ManagedUser } from "@/types/admin.ts";

type Department = { id: number; name: string; code: string; is_active?: boolean };
const EMPTY_ASSIGNED_USERS: ManagedUser[] = [];

export default function DepartmentAssignmentsPage() {
  const usersResponse = useApiQuery(endpoints.administration.listUsers);
  const departmentsResponse = useApiQuery(endpoints.organizationStructure.listDepartments);
  const updateUser = useApiMutation(endpoints.administration.updateUser);
  const [search, setSearch] = useState("");
  const users = (usersResponse?.data ?? EMPTY_ASSIGNED_USERS) as ManagedUser[];
  const departments = (departmentsResponse?.data ?? []) as Department[];
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return users.filter((user) => !value || `${user.name} ${user.email} ${user.role?.label ?? ""} ${user.department?.name ?? ""}`.toLowerCase().includes(value));
  }, [search, users]);
  if (!usersResponse || !departmentsResponse) return <PageContentLoader variant="table" />;

  const assign = async (user: ManagedUser, value: string) => {
    try { await updateUser({ id: user.id, department_id: value === "none" ? null : Number(value) }); toast.success(`${user.name} department assignment updated`); }
    catch { toast.error("Unable to update department assignment"); }
  };

  return <div className="space-y-5 p-4 pb-24 md:p-6 md:pb-6">
    <div><p className="text-sm font-medium text-primary">Administration</p><h1 className="text-xl font-semibold tracking-tight">Department assignments</h1><p className="mt-1 text-sm text-muted-foreground">Assign each Department Manager or department user to the workspace they are responsible for.</p></div>
    <Card className="border-primary/15 bg-primary/[0.025]"><CardContent className="flex flex-wrap items-center gap-4 p-4"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div><div><p className="font-semibold">Access follows assignment</p><p className="text-xs text-muted-foreground">Users can only see departmental orders for their assigned active department.</p></div><Badge variant="outline" className="ml-auto">{departments.length} departments · {users.length} users</Badge></CardContent></Card>
    <Card><CardHeader className="border-b py-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Users and departments</CardTitle><div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search users..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3"><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></td><td className="px-4 py-3"><Badge variant="secondary">{user.role?.label ?? "No role"}</Badge></td><td className="px-4 py-3"><Select value={String(user.department?.id ?? "none")} onValueChange={(value) => void assign(user, value)}><SelectTrigger className="w-56"><SelectValue placeholder="Assign department" /></SelectTrigger><SelectContent><SelectItem value="none">No department</SelectItem>{departments.filter((department) => department.is_active !== false).map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name} · {department.code}</SelectItem>)}</SelectContent></Select></td><td className="px-4 py-3">{user.isActive ? <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</td></tr>)}</tbody></table>{!filtered.length && <div className="py-14 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 size-6 text-primary/35" />No users match the search.</div>}</div></CardContent></Card>
  </div>;
}
