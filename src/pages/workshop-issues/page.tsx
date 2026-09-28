import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command-lite.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useApiMutation, useApiQuery } from "@/hooks/use-api.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { endpoints } from "@/api/endpoints.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { DocumentViewer, type DocumentViewerDocument } from "@/components/documents/document-viewer.tsx";
import { toast } from "@/lib/system-message.ts";
import { cn } from "@/lib/utils.ts";
import { CalendarClock, Car, Download, Eye, FilePlus2, PackageMinus, Plus, Trash2, UserRound } from "lucide-react";

type Option = { value: string; label: string; keywords?: string };
type IssueLine = { productId: string; quantity: string; unit: string; comment: string };

const downloadWorkshopIssuePdf = async (issue: any) => {
  const { downloadWorkshopIssuePdf: generatePdf } = await import("@/lib/workshop-issue-pdf.ts");
  return generatePdf(issue);
};

const generateWorkshopIssuePdf = async (issue: any) => {
  const { generateWorkshopIssuePdf: generatePdf } = await import("@/lib/workshop-issue-pdf.ts");
  return generatePdf(issue);
};
 
const nowValue = () => { const date = new Date(); const pad = (value: number) => String(value).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };

function SearchableSelect({ value, onValueChange, options, placeholder, searchPlaceholder }: { value: string; onValueChange: (value: string) => void; options: Option[]; placeholder: string; searchPlaceholder: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}><span className="truncate">{selected?.label ?? placeholder}</span><span className="text-xs">⌄</span></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"><Command><CommandInput placeholder={searchPlaceholder} /><CommandList><CommandEmpty>No matching record found.</CommandEmpty><CommandGroup>{options.map((option) => <CommandItem key={option.value} value={`${option.label} ${option.keywords ?? ""}`} onSelect={() => { onValueChange(option.value); setOpen(false); }}>{option.label}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}

export default function WorkshopIssuesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = user?.role === "super_admin" || user?.permissions.includes("workshop.issues.create");
  const warehouses = useApiQuery(endpoints.warehouses.listWarehouses);
  const vehicles = useApiQuery(endpoints.vehicles.list);
  const staff = useApiQuery(endpoints.workshopStaff.list);
  const products = useApiQuery(endpoints.inventory.listProducts, { includeInactive: false });
  const issues = useApiQuery(endpoints.workshopIssues.list);
  const createIssue = useApiMutation(endpoints.workshopIssues.create);
  const downloadIssuePdf = async (issue: any) => {
    toast.loading("Generating workshop issue PDF...");
    try {
      const pdfIssue = issue.issuedBy === user?.profile.name ? { ...issue, issuedBySignatureUrl: user?.profile.signatureUrl } : issue;
      await downloadWorkshopIssuePdf(pdfIssue);
      toast.success("Workshop issue PDF downloaded successfully");
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to generate workshop issue PDF"));
    }
  };
  const [warehouseId, setWarehouseId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [collectorStaffId, setCollectorStaffId] = useState("");
  const [issuedAt, setIssuedAt] = useState(nowValue());
  const [purpose, setPurpose] = useState("Workshop spare parts");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<IssueLine[]>([{ productId: "", quantity: "1", unit: "", comment: "" }]);
  const [saving, setSaving] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentViewerDocument | null>(null);
  const stock = useApiQuery(endpoints.warehouses.getWarehouseStock, warehouseId ? { warehouseId } : "skip");
  const stockByProduct = useMemo(() => new Map((stock ?? []).map((row: any) => [String(row.product?.id ?? row.productId), Number(row.available ?? row.quantity ?? 0)])), [stock]);
  const productOptions = useMemo<Option[]>(() => (products ?? []).map((product: any) => { const id = String(product._id ?? product.id); const available = stockByProduct.get(id) ?? 0; return { value: id, label: `${product.name} · ${product.sku} · available ${available}`, keywords: `${product.name} ${product.sku}` }; }), [products, stockByProduct]);
  const vehicleOptions = useMemo<Option[]>(() => (vehicles ?? []).filter((vehicle: any) => vehicle.isActive).map((vehicle: any) => ({ value: String(vehicle.id), label: `${vehicle.registrationNumber} · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}`, keywords: `${vehicle.registrationNumber} ${vehicle.make ?? ""} ${vehicle.model ?? ""}` })), [vehicles]);
  const staffOptions = useMemo<Option[]>(() => (staff ?? []).filter((person: any) => person.isActive).map((person: any) => ({ value: String(person.id), label: `${person.name}${person.staffNumber ? ` · ${person.staffNumber}` : ""}`, keywords: `${person.name} ${person.staffNumber ?? ""} ${person.department ?? ""}` })), [staff]);
  const updateLine = (index: number, values: Partial<IssueLine>) => setLines((current) => current.map((line, lineIndex) => { if (lineIndex !== index) return line; const nextProduct = values.productId ? (products as any[]).find((product) => String(product._id ?? product.id) === values.productId) : undefined; return { ...line, ...values, ...(values.productId ? { unit: nextProduct?.unit?.abbreviation ?? nextProduct?.unit?.name ?? "" } : {}) }; }));
  const reset = () => { setVehicleId(""); setCollectorStaffId(""); setIssuedAt(nowValue()); setPurpose("Workshop spare parts"); setNotes(""); setLines([{ productId: "", quantity: "1", unit: "", comment: "" }]); };
  const submit = async () => {
    if (!warehouseId) return toast.error("Select the workshop warehouse");
    const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (!validLines.length) return toast.error("Add at least one spare part");
    if (new Set(validLines.map((line) => line.productId)).size !== validLines.length) return toast.error("Each spare part should appear only once");
    setSaving(true);
    toast.loading("Recording issue and preparing PDF...");
    try {
      const created = await createIssue({ warehouseId, vehicleId: vehicleId || undefined, collectorStaffId: collectorStaffId || undefined, issuedAt, purpose, notes: notes || undefined, items: validLines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unit: line.unit || undefined, comment: line.comment || undefined })) });
      toast.loading("Generating workshop issue PDF...");
      await downloadWorkshopIssuePdf({ ...created, issuedBySignatureUrl: user?.profile.signatureUrl });
      toast.success(`Issue ${created.reference} recorded and PDF downloaded successfully`);
      reset();
    } catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to record issue or generate its PDF. Check available stock and try again.")); }
    finally { setSaving(false); }
  };
  const previewIssuePdf = async (issue: any) => {
    toast.loading("Preparing workshop issue preview...");
    try {
      const pdfIssue = issue.issuedBy === user?.profile.name ? { ...issue, issuedBySignatureUrl: user?.profile.signatureUrl } : issue;
      const blob = await generateWorkshopIssuePdf(pdfIssue);
      setPreviewDocument({ name: `${issue.reference}.pdf`, mimeType: "application/pdf", downloadPath: "", previewUrl: URL.createObjectURL(blob) });
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Unable to preview workshop issue PDF"));
    }
  };
if (!warehouses || !vehicles || !staff || !products || !issues) return <PageContentLoader variant="detail" />;
  return <div className="space-y-5 p-6 pb-24 md:pb-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Workshop Warehouse Issues</h1><p className="text-sm text-muted-foreground">Issue spare parts to vehicles and individuals with a controlled, printable issue note.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate("/vehicles")}><Car className="size-4" />Vehicles</Button><Button variant="outline" onClick={() => navigate("/staff")}><UserRound className="size-4" />Staff</Button></div></div>{canCreate && <Card className="border-primary/20 shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FilePlus2 className="size-4 text-primary" />New workshop issue</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Warehouse *</Label><Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger><SelectContent>{warehouses.map((warehouse: any) => <SelectItem key={warehouse._id} value={String(warehouse._id)}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Vehicle</Label><SearchableSelect value={vehicleId} onValueChange={setVehicleId} options={vehicleOptions} placeholder="Search vehicle..." searchPlaceholder="Search registration number..." /></div><div className="space-y-2"><Label>Collected by</Label><SearchableSelect value={collectorStaffId} onValueChange={setCollectorStaffId} options={staffOptions} placeholder="Search staff..." searchPlaceholder="Search name or staff number..." /></div><div className="space-y-2"><Label>Date and time *</Label><div className="relative"><CalendarClock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="datetime-local" className="pl-9" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></div></div><div className="space-y-2 md:col-span-2 xl:col-span-2"><Label>Purpose</Label><Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Reason for issue" /></div><div className="space-y-2 md:col-span-2 xl:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for the workshop or warehouse record" /></div></div><div className="rounded-xl border"><div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3"><div><p className="text-sm font-semibold">Spare parts to issue</p><p className="text-xs text-muted-foreground">Available quantity is read from the selected warehouse.</p></div><Button variant="outline" size="sm" onClick={() => setLines([...lines, { productId: "", quantity: "1", unit: "", comment: "" }])}><Plus className="size-4" />Add line</Button></div><div className="space-y-3 p-4">{lines.map((line, index) => { const selectedProduct = (products as any[]).find((product) => String(product._id ?? product.id) === line.productId); const available = stockByProduct.get(line.productId) ?? 0; return <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,2fr)_100px_100px_minmax(0,1.3fr)_auto] md:items-end"><div className="space-y-2"><Label>Spare part</Label><SearchableSelect value={line.productId} onValueChange={(value) => updateLine(index, { productId: value, unit: (selectedProduct?.unit?.abbreviation ?? selectedProduct?.unit?.name ?? "") })} options={productOptions} placeholder="Search product or SKU..." searchPlaceholder="Search spare parts..." /></div><div className="space-y-2"><Label>Available</Label><div className="flex h-10 items-center rounded-md bg-muted px-3 text-sm font-medium">{available}</div></div><div className="space-y-2"><Label>Out</Label><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></div><div className="space-y-2"><Label>Unit / comment</Label><Input value={line.comment} onChange={(event) => updateLine(index, { comment: event.target.value })} placeholder={selectedProduct?.unit?.abbreviation || "Comment"} /></div><Button variant="ghost" size="icon" className="text-destructive" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="size-4" /></Button></div>; })}</div></div><div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving}>{saving ? "Recording..." : "Issue & Download PDF"}<PackageMinus className="size-4" /></Button></div></CardContent></Card>}<Card><CardHeader><CardTitle className="text-base">Recent workshop issues</CardTitle></CardHeader><CardContent className="p-0"><div className="divide-y">{(issues as any[]).map((issue) => <div key={issue.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{issue.reference}</span><Badge variant="secondary">{issue.items?.length ?? 0} items</Badge></div><p className="mt-1 text-sm">{issue.vehicle?.registrationNumber || "No vehicle"} · {issue.collector?.name || "No collector"} · {issue.warehouse?.name}</p><p className="text-xs text-muted-foreground">{issue.issuedAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(issue.issuedAt)) : ""} · {issue.issuedBy || ""}</p></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" title="Preview workshop issue PDF" aria-label="Preview workshop issue PDF" onClick={() => void previewIssuePdf(issue)}><Eye className="size-4" /></Button><Button variant="outline" size="sm" onClick={() => void downloadIssuePdf(issue)}><Download className="size-4" />PDF</Button></div></div>)}{!(issues as any[]).length && <p className="px-4 py-12 text-center text-sm text-muted-foreground">No workshop issues recorded yet.</p>}</div></CardContent></Card><DocumentViewer document={previewDocument} onOpenChange={(document) => { if (!document && previewDocument?.previewUrl) URL.revokeObjectURL(previewDocument.previewUrl); if (!document) setPreviewDocument(null); }} /></div>;
}
