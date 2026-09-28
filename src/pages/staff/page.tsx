import { useMemo, useRef, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { Edit2, FileSpreadsheet, Loader2, Mail, Phone, Plus, Search, Trash2, Upload, UserRound } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { endpoints } from "@/api/endpoints.ts";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";

type StaffForm = { staffNumber: string; name: string; position: string; department: string; phone: string; email: string; isActive: boolean };
type StaffImportRow = { staff_number: string; name: string; position: string; department: string };
const emptyForm: StaffForm = { staffNumber: "", name: "", position: "", department: "Workshop", phone: "", email: "", isActive: true };

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const asText = (value: unknown) => String(value ?? "").trim();

export default function StaffPage() {
  const { user } = useAuth();
  const staff = useApiQuery(endpoints.workshopStaff.list);
  const create = useApiMutation(endpoints.workshopStaff.create);
  const update = useApiMutation(endpoints.workshopStaff.update);
  const remove = useApiMutation(endpoints.workshopStaff.remove);
  const canManage = user?.role === "super_admin" || user?.permissions.includes("staff.manage");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useDraftState("staff", emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<StaffImportRow[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => (staff ?? []).filter((person) => `${person.staffNumber ?? ""} ${person.name} ${person.position ?? ""} ${person.department ?? ""} ${person.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())), [staff, search]);
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialog(true); };
  const openEdit = (person: any) => { setEditingId(person.id); setForm({ staffNumber: person.staffNumber ?? "", name: person.name, position: person.position ?? "", department: person.department ?? "Workshop", phone: person.phone ?? "", email: person.email ?? "", isActive: person.isActive }); setDialog(true); };
  const save = async () => { if (!form.name.trim()) return toast.error("Staff name is required"); try { if (editingId) await update({ id: editingId, ...form }); else await create(form); toast.success(editingId ? "Staff member updated" : "Staff member added"); setDialog(false); } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to save staff member")); } };

  const readImportFile = async (file: File) => {
    toast.loading("Reading staff import file...");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const rows = parsed.map((raw) => {
        const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
        const name = [row.first_name, row.local_name, row.last_name].map(asText).filter(Boolean).join(" ") || asText(row.name);
        return { staff_number: asText(row.employee_id ?? row.staff_number ?? row.staff_no), name, position: asText(row.position), department: asText(row.department) || "Workshop" };
      }).filter((row) => row.name);
      if (!rows.length) throw new Error("No staff rows with names were found.");
      if (rows.length > 5000) throw new Error("A maximum of 5,000 staff members can be imported at once.");
      setImportRows(rows); setImportFilename(file.name); setImportOpen(true); toast.success("Staff file loaded and ready for review");
    } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to read this staff file")); }
    finally { if (importInput.current) importInput.current.value = ""; }
  };

  const submitImport = async () => {
    setImportBusy(true);
    toast.loading("Importing workshop staff...");
    try {
      const response = await apiClient.post<{ data?: { imported?: number }; message?: string }>("/staff/import", { rows: importRows });
      const imported = response.data.data?.imported ?? importRows.length;
      toast.success(`${imported.toLocaleString()} staff members imported successfully`);
      setImportOpen(false); setImportRows([]); window.dispatchEvent(new Event("stockflow:api-invalidated"));
    } catch (cause) { toast.error(getApiErrorMessage(cause, "Staff import failed")); }
    finally { setImportBusy(false); }
  };

if (!staff) return <PageContentLoader variant="table" />;
  return <div className="space-y-5 p-6 pb-24 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Workshop Staff</h1><p className="text-sm text-muted-foreground">Select item collectors quickly when preparing a workshop issue.</p></div>{canManage && <div className="flex flex-wrap gap-2"><Input ref={importInput} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); }} /><Button variant="outline" onClick={() => importInput.current?.click()}><FileSpreadsheet className="size-4" />Import Staff</Button><Button onClick={openCreate}><Plus className="size-4" />Add Staff</Button></div>}</div>
    <Card><CardContent className="p-3"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, staff number, position or department..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Staff number</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{filtered.map((person: any) => <tr key={person.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3 font-mono text-xs">{person.staffNumber || "-"}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-4" /></span><span className="font-medium">{person.name}</span></div></td><td className="px-4 py-3">{person.position || "-"}</td><td className="px-4 py-3 text-muted-foreground">{person.department || "-"}</td><td className="px-4 py-3 text-xs text-muted-foreground"><div>{person.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{person.phone}</span>}{person.email && <span className="flex items-center gap-1"><Mail className="size-3" />{person.email}</span>}{!person.phone && !person.email && "-"}</div></td><td className="px-4 py-3"><Badge variant={person.isActive ? "secondary" : "outline"}>{person.isActive ? "Active" : "Inactive"}</Badge></td>{canManage && <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Edit staff" onClick={() => openEdit(person)}><Edit2 className="size-4" /></Button>{person.isActive && <Button variant="ghost" size="icon" aria-label="Archive staff" className="text-destructive" onClick={async () => { try { await remove({ id: person.id }); toast.success("Staff member archived"); } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to archive staff member")); } }}><Trash2 className="size-4" /></Button>}</div></td>}</tr>)}</tbody></table>{!filtered.length && <div className="py-16 text-center text-sm text-muted-foreground">No staff found.</div>}</div></CardContent></Card>
    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Staff number</Label><Input value={form.staffNumber} onChange={(event) => setForm({ ...form, staffNumber: event.target.value })} placeholder="WS-001" /></div><div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="space-y-2"><Label>Position</Label><Input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Mechanic" /></div><div className="space-y-2"><Label>Department</Label><Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Workshop" /></div><div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={() => void save()}>Save Staff</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Import Workshop Staff</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-muted-foreground">Names are merged from First Name, Local Name and Last Name. Employee ID becomes the staff number and Position is preserved.</p><div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2 text-left">Staff number</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Position</th><th className="px-3 py-2 text-left">Department</th></tr></thead><tbody>{importRows.slice(0, 10).map((row, index) => <tr key={index} className="border-t"><td className="px-3 py-2">{row.staff_number || "-"}</td><td className="px-3 py-2 font-medium">{row.name}</td><td className="px-3 py-2">{row.position || "-"}</td><td className="px-3 py-2">{row.department}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{importRows.length.toLocaleString()} rows ready from {importFilename} · maximum 5,000 per import</p></div><DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button disabled={importBusy} onClick={() => void submitImport()}>{importBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Import Staff</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
