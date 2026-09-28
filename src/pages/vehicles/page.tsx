import { useMemo, useRef, useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state.ts";
import { Car, Edit2, FileSpreadsheet, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
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

type VehicleForm = { registrationNumber: string; make: string; model: string; vehicleType: string; capacity: string; status: string; lastService: string; nextService: string; department: string; notes: string; isActive: boolean };
type VehicleImportRow = { registration_number: string; vehicle_type: string; capacity: string; status: string; last_service: string; next_service: string };
const emptyForm: VehicleForm = { registrationNumber: "", make: "", model: "", vehicleType: "", capacity: "", status: "available", lastService: "", nextService: "", department: "Workshop", notes: "", isActive: true };

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const asText = (value: unknown) => String(value ?? "").trim();

export default function VehiclesPage() {
  const { user } = useAuth();
  const vehicles = useApiQuery(endpoints.vehicles.list);
  const create = useApiMutation(endpoints.vehicles.create);
  const update = useApiMutation(endpoints.vehicles.update);
  const remove = useApiMutation(endpoints.vehicles.remove);
  const canManage = user?.role === "super_admin" || user?.permissions.includes("vehicles.manage");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useDraftState("vehicles", emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<VehicleImportRow[]>([]);
  const [importFilename, setImportFilename] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => (vehicles ?? []).filter((vehicle) => `${vehicle.registrationNumber} ${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.vehicleType ?? ""} ${vehicle.status ?? ""} ${vehicle.department ?? ""}`.toLowerCase().includes(search.toLowerCase())), [vehicles, search]);
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialog(true); };
  const openEdit = (vehicle: any) => { setEditingId(vehicle.id); setForm({ registrationNumber: vehicle.registrationNumber, make: vehicle.make ?? "", model: vehicle.model ?? "", vehicleType: vehicle.vehicleType ?? "", capacity: vehicle.capacity == null ? "" : String(vehicle.capacity), status: vehicle.status ?? (vehicle.isActive ? "available" : "inactive"), lastService: vehicle.lastService ?? "", nextService: vehicle.nextService ?? "", department: vehicle.department ?? "Workshop", notes: vehicle.notes ?? "", isActive: vehicle.isActive }); setDialog(true); };
  const save = async () => { if (!form.registrationNumber.trim()) return toast.error("Registration number is required"); try { if (editingId) await update({ id: editingId, ...form, capacity: form.capacity ? Number(form.capacity) : undefined }); else await create({ ...form, capacity: form.capacity ? Number(form.capacity) : undefined }); toast.success(editingId ? "Vehicle updated" : "Vehicle added"); setDialog(false); } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to save vehicle")); } };

  const readImportFile = async (file: File) => {
    toast.loading("Reading vehicle import file...");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const rows = parsed.map((raw) => {
        const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
        return { registration_number: asText(row.registration_number ?? row.registrationNumber).toUpperCase(), vehicle_type: asText(row.type ?? row.vehicle_type), capacity: asText(row.capacity), status: asText(row.status) || "available", last_service: asText(row.last_service), next_service: asText(row.next_service) };
      }).filter((row) => row.registration_number);
      if (!rows.length) throw new Error("No vehicle rows with registration numbers were found.");
      if (rows.length > 5000) throw new Error("A maximum of 5,000 vehicles can be imported at once.");
      setImportRows(rows); setImportFilename(file.name); setImportOpen(true); toast.success("Vehicle file loaded and ready for review");
    } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to read this vehicle file")); }
    finally { if (importInput.current) importInput.current.value = ""; }
  };

  const submitImport = async () => {
    setImportBusy(true);
    toast.loading("Importing vehicles...");
    try {
      const response = await apiClient.post<{ data?: { imported?: number }; message?: string }>("/vehicles/import", { rows: importRows });
      const imported = response.data.data?.imported ?? importRows.length;
      toast.success(`${imported.toLocaleString()} vehicles imported successfully`);
      setImportOpen(false); setImportRows([]); window.dispatchEvent(new Event("stockflow:api-invalidated"));
    } catch (cause) { toast.error(getApiErrorMessage(cause, "Vehicle import failed")); }
    finally { setImportBusy(false); }
  };

if (!vehicles) return <PageContentLoader variant="table" />;
  return <div className="space-y-5 p-6 pb-24 md:pb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Vehicles</h1><p className="text-sm text-muted-foreground">Maintain workshop vehicles used when issuing spare parts.</p></div>{canManage && <div className="flex flex-wrap gap-2"><Input ref={importInput} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); }} /><Button variant="outline" onClick={() => importInput.current?.click()}><FileSpreadsheet className="size-4" />Import Vehicles</Button><Button onClick={openCreate}><Plus className="size-4" />Add Vehicle</Button></div>}</div>
    <Card><CardContent className="p-3"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search registration, type, status or department..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Registration</th><th className="px-4 py-3">Vehicle type</th><th className="px-4 py-3">Capacity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last service</th><th className="px-4 py-3">Next service</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody>{filtered.map((vehicle: any) => <tr key={vehicle.id} className="border-t hover:bg-muted/20"><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Car className="size-4" /></span><span className="font-mono text-xs font-semibold">{vehicle.registrationNumber}</span></div></td><td className="px-4 py-3">{[vehicle.make, vehicle.model, vehicle.vehicleType].filter(Boolean).join(" · ") || "-"}</td><td className="px-4 py-3 tabular-nums">{vehicle.capacity ?? "-"}</td><td className="px-4 py-3"><Badge variant={vehicle.isActive ? "secondary" : "outline"}>{vehicle.status || (vehicle.isActive ? "available" : "inactive")}</Badge></td><td className="px-4 py-3 text-muted-foreground">{vehicle.lastService || "-"}</td><td className="px-4 py-3 text-muted-foreground">{vehicle.nextService || "-"}</td>{canManage && <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Edit vehicle" onClick={() => openEdit(vehicle)}><Edit2 className="size-4" /></Button>{vehicle.isActive && <Button variant="ghost" size="icon" aria-label="Archive vehicle" className="text-destructive" onClick={async () => { try { await remove({ id: vehicle.id }); toast.success("Vehicle archived"); } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to archive vehicle")); } }}><Trash2 className="size-4" /></Button>}</div></td>}</tr>)}</tbody></table>{!filtered.length && <div className="py-16 text-center text-sm text-muted-foreground">No vehicles found.</div>}</div></CardContent></Card>
    <Dialog open={dialog} onOpenChange={setDialog}><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Registration number *</Label><Input value={form.registrationNumber} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value.toUpperCase() })} placeholder="T 123 ABC" /></div><div className="space-y-2"><Label>Make</Label><Input value={form.make} onChange={(event) => setForm({ ...form, make: event.target.value })} placeholder="Toyota" /></div><div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="LandCruiser" /></div><div className="space-y-2"><Label>Vehicle type</Label><Input value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} placeholder="Tour vehicle" /></div><div className="space-y-2"><Label>Capacity</Label><Input type="number" min="0" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div><div className="space-y-2"><Label>Status</Label><Input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value, isActive: !["inactive", "retired", "disposed"].includes(event.target.value.toLowerCase()) })} placeholder="available" /></div><div className="space-y-2"><Label>Department</Label><Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Workshop" /></div><div className="space-y-2"><Label>Last service</Label><Input type="date" value={form.lastService} onChange={(event) => setForm({ ...form, lastService: event.target.value })} /></div><div className="space-y-2"><Label>Next service</Label><Input type="date" value={form.nextService} onChange={(event) => setForm({ ...form, nextService: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={() => void save()}>Save Vehicle</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Import Vehicles</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-muted-foreground">Registration number, Type, Capacity, Status, Last service and Next service are imported from the template. Existing registration numbers are updated.</p><div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2 text-left">Registration</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Capacity</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Last service</th><th className="px-3 py-2 text-left">Next service</th></tr></thead><tbody>{importRows.slice(0, 10).map((row, index) => <tr key={index} className="border-t"><td className="px-3 py-2 font-mono">{row.registration_number}</td><td className="px-3 py-2">{row.vehicle_type || "-"}</td><td className="px-3 py-2 text-right">{row.capacity || "-"}</td><td className="px-3 py-2">{row.status}</td><td className="px-3 py-2">{row.last_service || "-"}</td><td className="px-3 py-2">{row.next_service || "-"}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{importRows.length.toLocaleString()} rows ready from {importFilename} · maximum 5,000 per import</p></div><DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button disabled={importBusy} onClick={() => void submitImport()}>{importBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Import Vehicles</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
