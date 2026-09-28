import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { useApiQueryState } from "@/hooks/use-api.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageContentLoader } from "@/components/ui/page-loader.tsx";
import { downloadReportPdf } from "@/lib/report-pdf.ts";
import { toast } from "@/lib/system-message.ts";

type Template = { key: string; name: string; description: string; is_new?: boolean };
type Column = { key: string; label: string; format?: "currency" | "number" | "date" | "text" };
type Kpi = { label: string; value: string | number; format: "currency" | "number" | "text" };
type Report = { key: string; name: string; description: string; currency: string; generated_at: string; available: boolean; source_note: string; missing_sources?: string[]; columns: Column[]; rows: Record<string, unknown>[]; kpis: Kpi[]; chart: { name: string; value: number }[] };

const FALLBACK: Template[] = [
  ["profit-loss", "Profit & Loss Report"], ["purchases", "Purchase Report"], ["purchase-returns", "Purchase Return Report"], ["purchase-payments", "Purchase Payments Report"], ["item-sales", "Item Sales Report"], ["item-purchases", "Item Purchase Report"], ["sales", "Sales Report"], ["sales-returns", "Sales Return Report"], ["sales-payments", "Sales Payments Report"], ["stock", "Stock Report"], ["expenses", "Expense Report"], ["expired-items", "Expired Items Report"],
].map(([key, name]) => ({ key, name, description: "" }));

const localDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get("report") ?? "stock";
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => localDateInput(new Date()));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const reportGenerationPending = useRef(false);

  const templatesQuery = useApiQueryState(endpoints.reports.listTemplates);
  const templates = (templatesQuery.data as Template[] | undefined) ?? FALLBACK;
  const reportQuery = useApiQueryState(endpoints.reports.getReport, { report: active, from, to }, { refreshInterval: 30_000 });
  const report = reportQuery.data as Report | undefined;

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return report?.rows ?? [];
    return (report?.rows ?? []).filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch)));
  }, [report, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [active, from, to, search, pageSize]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  useEffect(() => {
    reportGenerationPending.current = true;
    toast.loading("Generating report...");
  }, [active, from, to]);
  useEffect(() => {
    if (!reportGenerationPending.current) return;
    if (reportQuery.error) {
      reportGenerationPending.current = false;
      toast.error("Report generation failed. Refresh and try again.");
      return;
    }
    if (!reportQuery.isLoading && !reportQuery.isRefreshing && report) {
      reportGenerationPending.current = false;
      toast.success("Report generated successfully");
    }
  }, [report, reportQuery.error, reportQuery.isLoading, reportQuery.isRefreshing]);

  const fmt = (value: unknown, column?: Column, kpi?: Kpi) => {
    const format = column?.format ?? kpi?.format;
    if (format === "date") {
      if (!value) return "-";
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-GB");
    }
    if (format === "currency") return `${report?.currency ?? ""} ${Number(value ?? 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format === "number") return Number(value ?? 0).toLocaleString("en-TZ", { maximumFractionDigits: 3 });
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
  };

  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const exportCsv = () => {
    if (!report || !report.columns.length) return;
    toast.loading("Preparing CSV export...");
    try {
      const csv = [report.columns.map((column) => quote(column.label)).join(","), ...rows.map((row) => report.columns.map((column) => quote(row[column.key])).join(","))].join("\r\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      link.download = `${report.key}-${from}-${to}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("CSV export created successfully");
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "CSV export failed"));
    }
  };

  const exportPdf = async () => {
    if (!report || !report.columns.length || !rows.length) return;
    toast.loading("Generating report PDF...");
    try {
      await downloadReportPdf({ ...report, rows, filters: { from, to } });
      toast.success("Report PDF created successfully");
    } catch (cause) {
      toast.error(getApiErrorMessage(cause, "Report PDF generation failed"));
    }
  };

  return <div className="space-y-5 p-6 print:p-0">
    <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Live reporting</p><h1 className="mt-1 text-xl font-semibold">Reports</h1><p className="text-sm text-muted-foreground">Operational reporting from the current inventory and procurement ledgers.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { reportGenerationPending.current = true; toast.loading("Refreshing report..."); void reportQuery.reload(true); }} disabled={reportQuery.isRefreshing}><RefreshCw className={`size-4 ${reportQuery.isRefreshing ? "animate-spin" : ""}`} />Refresh</Button>
        <Button variant="outline" disabled={!rows.length} onClick={exportCsv}><Download className="size-4" />Export CSV</Button>
        <Button variant="outline" disabled={!rows.length} onClick={() => void exportPdf()}><Download className="size-4" />Export PDF</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
      <Card className="h-fit print:hidden"><CardContent className="p-2"><p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report templates</p>{templates.map((template) => <button key={template.key} type="button" onClick={() => setParams({ report: template.key })} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${active === template.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><FileSpreadsheet className="size-4 shrink-0" /><span className="flex-1">{template.name}</span>{template.is_new && <Badge className="bg-emerald-500 text-white">New</Badge>}</button>)}</CardContent></Card>
      <div className="min-w-0 space-y-4">
        <Card className="print:hidden"><CardContent className="flex flex-wrap items-end gap-3 p-4"><div><label className="mb-1 block text-xs font-medium">From</label><Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></div><div><label className="mb-1 block text-xs font-medium">To</label><Input type="date" value={to} min={from} max={localDateInput(new Date())} onChange={(event) => setTo(event.target.value)} /></div><div className="relative min-w-56 flex-1"><Search className="absolute bottom-2.5 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report rows..." /></div><div><label className="mb-1 block text-xs font-medium">Rows per page</label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div></CardContent></Card>

        {reportQuery.error ? <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>Report could not be loaded</AlertTitle><AlertDescription>Refresh the report or check that the API is available.</AlertDescription></Alert> : null}
        {reportQuery.isLoading || !report ? <PageContentLoader variant="detail" /> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{report.name}</h2><Badge variant={report.available ? "secondary" : "destructive"}>{report.available ? "Live" : "Unavailable"}</Badge></div><p className="text-sm text-muted-foreground">{report.description}</p></div><div className="text-right text-xs text-muted-foreground"><p>{reportQuery.isRefreshing ? <span className="inline-flex items-center gap-1 text-primary"><Loader2 className="size-3 animate-spin" />Refreshing</span> : "Live data"}</p><p>Updated {new Date(report.generated_at).toLocaleString()}</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{report.kpis.map((kpi) => <Card key={kpi.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{kpi.label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{fmt(kpi.value, undefined, kpi)}</p></CardContent></Card>)}</div>
          <Alert variant={report.available ? "default" : "destructive"}>{report.available ? <BarChart3 className="size-4" /> : <AlertTriangle className="size-4" />}<AlertTitle>{report.available ? "Live data source" : "Data source unavailable"}</AlertTitle><AlertDescription>{report.source_note}{report.missing_sources?.length ? ` Missing: ${report.missing_sources.join(", ")}.` : ""}</AlertDescription></Alert>
          {!!report.chart.length && <Card><CardContent className="pt-5"><ResponsiveContainer width="100%" height={230}><BarChart data={report.chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>}
          <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/70"><tr>{report.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">{column.label}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${String(row[report.columns[0]?.key] ?? "row")}-${index}`} className="border-t hover:bg-muted/30">{report.columns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.format === "currency" || column.format === "number" ? "text-right tabular-nums" : ""}`}>{fmt(row[column.key], column)}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="py-16 text-center"><FileSpreadsheet className="mx-auto mb-3 size-10 text-muted-foreground" /><p className="font-medium">No records for this report</p><p className="mt-1 text-sm text-muted-foreground">Adjust the date range or begin recording activity in the related operational module.</p></div>}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>Showing {rows.length ? ((page - 1) * pageSize) + 1 : 0}-{Math.min(page * pageSize, rows.length)} of {rows.length.toLocaleString()} records · {report.currency}</span>{rows.length > pageSize && <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" />Previous</Button><span>Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next<ChevronRight className="size-4" /></Button></div>}</div></Card>
        </>}
      </div>
    </div>
  </div>;
}
