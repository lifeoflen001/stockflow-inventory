import {
  CompanyHeader,
  DataTable,
  DocumentFooter,
  DocumentTitle,
  InfoBlock,
  PDF_PAGE,
  createCorporatePdf,
  formatPdfCurrency,
  formatPdfDate,
  formatPdfNumber,
  loadCorporateLogo,
  safePdfFilename,
} from "@/lib/pdf-design-system.ts";

type ReportColumn = { key: string; label: string; format?: "currency" | "number" | "date" | "text" };
type ReportKpi = { label: string; value: string | number; format: "currency" | "number" | "text" };
type ReportDocument = { key: string; name: string; description: string; currency?: string; generated_at?: string; source_note?: string; filters?: { from?: string | null; to?: string | null }; columns: ReportColumn[]; rows: Record<string, unknown>[]; kpis: ReportKpi[] };

const formatCell = (value: unknown, column: ReportColumn, currency: string) => {
  if (value === null || value === undefined || value === "") return "-";
  if (column.format === "date") return formatPdfDate(String(value));
  if (column.format === "currency") return formatPdfCurrency(Number(value), currency);
  if (column.format === "number") return formatPdfNumber(Number(value), 3);
  return String(value);
};

export async function downloadReportPdf(report: ReportDocument) {
  const pdf = createCorporatePdf("landscape");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_PAGE.margin * 2;
  const currency = report.currency || "TSHS";
  const logo = await loadCorporateLogo();
  const company = { name: "NeatNest Organized Inventories" };
  let y = CompanyHeader(pdf, company, logo, { orientation: "landscape" });
  y = DocumentTitle(pdf, report.name, report.description, y + 8);
  y = InfoBlock(pdf, { x: PDF_PAGE.margin, y, width: contentWidth, columns: 4, title: "Report context", items: [{ label: "Generated", value: formatPdfDate(report.generated_at) }, { label: "Period from", value: report.filters?.from || "All time" }, { label: "Period to", value: report.filters?.to || "Today" }, { label: "Currency", value: currency }] }) + 5;
  if (report.kpis.length) y = InfoBlock(pdf, { x: PDF_PAGE.margin, y, width: contentWidth, columns: Math.min(4, Math.max(1, report.kpis.length)), title: "Key figures", items: report.kpis.slice(0, 8).map((kpi) => ({ label: kpi.label, value: kpi.format === "currency" ? formatPdfCurrency(Number(kpi.value), currency) : kpi.format === "number" ? formatPdfNumber(Number(kpi.value), 3) : String(kpi.value) })) }) + 5;
  if (report.source_note) y = InfoBlock(pdf, { x: PDF_PAGE.margin, y, width: contentWidth, columns: 1, title: "Source note", items: [{ label: "Information", value: report.source_note }] }) + 5;

  const numericColumns = report.columns.map((column, index) => [index, column.format === "currency" || column.format === "number"] as const).filter(([, numeric]) => numeric).map(([index]) => index);
  DataTable(pdf, { startY: y, headers: report.columns.map((column) => column.label), rows: report.rows.map((row) => report.columns.map((column) => formatCell(row[column.key], column, currency))), currencyColumns: numericColumns, onPage: () => DocumentFooter(pdf), fontSize: 7.1 });
  DocumentFooter(pdf);
  const filename = `${safePdfFilename(report.name || "report")}-${report.filters?.from || "all"}-${report.filters?.to || "today"}.pdf`;
  const url = URL.createObjectURL(pdf.output("blob"));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
