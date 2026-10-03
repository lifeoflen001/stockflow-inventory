import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import localLogoUrl from "@/assets/neatnest-lotus-logo.png";
import { addSignatureImage, type SignatureImage } from "@/lib/pdf-signature.ts";

export type PdfCompany = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tin?: string | null;
  vrn?: string | null;
  currency?: string | null;
};

export type PdfInfoItem = { label: string; value?: string | number | null };
export type PdfTableRow = Array<string | number | null>;

export const PDF_COLORS = {
  primary: [29, 88, 145] as [number, number, number],
  ink: [24, 43, 63] as [number, number, number],
  muted: [96, 114, 132] as [number, number, number],
  border: [195, 210, 225] as [number, number, number],
  soft: [244, 248, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export const PDF_PAGE = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
  margin: 14,
  footerHeight: 10,
};

type LogoAsset = { dataUrl: string; width: number; height: number };
let logoPromise: Promise<LogoAsset | undefined> | undefined;

const asText = (value: string | number | null | undefined) => value === null || value === undefined ? "-" : String(value);

export const formatPdfDate = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export const formatPdfDateTime = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export const formatPdfNumber = (value: number | string | null | undefined, maximumFractionDigits = 2) => Number(value || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits });
export const formatPdfCurrency = (value: number | string | null | undefined, currency = "TSHS") => `${currency} ${formatPdfNumber(value)}`;
export const safePdfFilename = (value: string, fallback = "document") => (value || fallback).replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-");

export function createCorporatePdf(orientation: "portrait" | "landscape" = "portrait") {
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  pdf.setLineJoin("miter");
  pdf.setLineCap("butt");
  return pdf;
}

export async function loadCorporateLogo(): Promise<LogoAsset | undefined> {
  if (!logoPromise) {
    logoPromise = fetch(localLogoUrl).then(async (response) => {
      if (!response.ok) return undefined;
      const blob = await response.blob();
      const dataUrl = await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) return undefined;
      const dimensions = await new Promise<{ width: number; height: number } | undefined>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
        image.onerror = () => resolve(undefined);
        image.src = dataUrl;
      });
      return dimensions ? { dataUrl, ...dimensions } : undefined;
    }).catch(() => undefined);
  }
  return logoPromise;
}

export function CompanyHeader(pdf: jsPDF, company: PdfCompany | undefined, logo: LogoAsset | undefined, options: { top?: number; title?: string; subtitle?: string; orientation?: "portrait" | "landscape" } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = PDF_PAGE.margin;
  const top = options.top ?? 10;
  const height = options.orientation === "landscape" ? 34 : 40;
  const width = pageWidth - margin * 2;
  const companyName = company?.name?.trim() || "NeatNest Organized Inventories";
  const address = company?.address?.trim() || "";
  const phone = company?.phone?.trim() || "-";
  const email = company?.email?.trim() || "-";
  const logoBox = { x: margin + 3, y: top + 4, width: 43, height: height - 8 };
  const informationX = logoBox.x + logoBox.width + 9;
  const informationWidth = pageWidth - margin - informationX;

  pdf.setDrawColor(...PDF_COLORS.primary);
  pdf.setLineWidth(0.45);
  pdf.setFillColor(...PDF_COLORS.white);
  pdf.roundedRect(margin, top, width, height, 1.4, 1.4, "FD");
  if (logo) {
    const ratio = Math.min(logoBox.width / logo.width, logoBox.height / logo.height);
    const logoWidth = logo.width * ratio;
    const logoHeight = logo.height * ratio;
    try { pdf.addImage(logo.dataUrl, "PNG", logoBox.x + (logoBox.width - logoWidth) / 2, logoBox.y + (logoBox.height - logoHeight) / 2, logoWidth, logoHeight); } catch { /* continue with the text header */ }
  }

  pdf.setTextColor(...PDF_COLORS.primary);
  pdf.setFont("helvetica", "bold");
  let titleSize = options.orientation === "landscape" ? 13.2 : 12.5;
  pdf.setFontSize(titleSize);
  while (pdf.getTextWidth(companyName) > informationWidth && titleSize > 8.5) { titleSize -= 0.25; pdf.setFontSize(titleSize); }
  const companyLines = pdf.splitTextToSize(companyName, informationWidth).slice(0, 2);
  pdf.text(companyLines, informationX + informationWidth / 2, top + 8.5, { align: "center", lineHeightFactor: 1.05 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.2);
  pdf.setTextColor(...PDF_COLORS.ink);
  const contactY = top + (companyLines.length > 1 ? 18 : 16);
  const addressLines = pdf.splitTextToSize(address, informationWidth).slice(0, 2);
  pdf.text(addressLines, informationX, contactY, { lineHeightFactor: 1.1 });
  const contactOffset = addressLines.length > 1 ? 8.5 : 5.1;
  pdf.text(`Phone: ${phone}`, informationX, contactY + contactOffset);
  pdf.text(`Email: ${email}`, informationX, contactY + contactOffset + 5.1);

  return top + height;
}

export function DocumentTitle(pdf: jsPDF, title: string, subtitle?: string, y = 53) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setTextColor(...PDF_COLORS.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(title.toUpperCase(), pageWidth / 2, y, { align: "center" });
  if (subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.text(subtitle, pageWidth / 2, y + 5.5, { align: "center" });
  }
  return y + (subtitle ? 11 : 7);
}

export function InfoBlock(pdf: jsPDF, options: { x: number; y: number; width: number; items: PdfInfoItem[]; columns?: number; title?: string; minHeight?: number }) {
  const columns = Math.max(1, options.columns ?? 2);
  const rows = Math.ceil(options.items.length / columns);
  const cellWidth = options.width / columns;
  const titleHeight = options.title ? 8 : 0;
  const rowHeight = 13;
  const height = Math.max(options.minHeight ?? 0, titleHeight + rows * rowHeight + 4);
  pdf.setFillColor(...PDF_COLORS.soft);
  pdf.setDrawColor(...PDF_COLORS.border);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(options.x, options.y, options.width, height, 1.2, 1.2, "FD");
  if (options.title) {
    pdf.setTextColor(...PDF_COLORS.primary);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(options.title, options.x + 4, options.y + 5.5);
  }
  options.items.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = options.x + column * cellWidth + 4;
    const y = options.y + titleHeight + row * rowHeight + 6.5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.setTextColor(...PDF_COLORS.muted);
    pdf.text(item.label.toUpperCase(), x, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.4);
    pdf.setTextColor(...PDF_COLORS.ink);
    const lines = pdf.splitTextToSize(asText(item.value), cellWidth - 8).slice(0, 2);
    pdf.text(lines, x, y + 4.2, { lineHeightFactor: 1.05 });
  });
  return options.y + height;
}

export function DataTable(pdf: jsPDF, options: { startY: number; headers: string[]; rows: PdfTableRow[]; columnStyles?: Record<number, Record<string, unknown>>; currencyColumns?: number[]; onPage?: () => void; fontSize?: number }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = PDF_PAGE.margin;
  const currencyColumns = new Set(options.currencyColumns ?? []);
  autoTable(pdf, {
    startY: options.startY,
    head: [options.headers],
    body: options.rows.length ? options.rows : [["No records", ...options.headers.slice(1).map(() => "")]],
    theme: "grid",
    margin: { left: margin, right: margin, bottom: PDF_PAGE.footerHeight + 5 },
    tableWidth: pageWidth - margin * 2,
    styles: { font: "helvetica", fontSize: options.fontSize ?? 8.2, textColor: PDF_COLORS.ink, lineColor: PDF_COLORS.border, lineWidth: 0.22, cellPadding: { top: 2.2, right: 2.2, bottom: 2.2, left: 2.2 }, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: PDF_COLORS.primary, textColor: PDF_COLORS.white, fontStyle: "bold", halign: "center", valign: "middle", lineColor: PDF_COLORS.primary, lineWidth: 0.25, minCellHeight: 8 },
    bodyStyles: { fillColor: PDF_COLORS.white },
    alternateRowStyles: { fillColor: [249, 251, 253] },
    columnStyles: options.columnStyles,
    didParseCell: (data: any) => { if (data.section === "body" && currencyColumns.has(data.column.index)) data.cell.styles.halign = "right"; },
    didDrawPage: () => options.onPage?.(),
  });
  return Number((pdf as any).lastAutoTable?.finalY || options.startY);
}

export function TotalsSection(pdf: jsPDF, options: { x: number; y: number; width: number; rows: Array<{ label: string; value: string; emphasis?: boolean }>; total?: { label: string; value: string } }) {
  const rowHeight = 6.5;
  const height = (options.rows.length + (options.total ? 1 : 0)) * rowHeight + 5;
  pdf.setDrawColor(...PDF_COLORS.border);
  pdf.setLineWidth(0.25);
  pdf.setFillColor(...PDF_COLORS.soft);
  pdf.roundedRect(options.x, options.y, options.width, height, 1, 1, "FD");
  let y = options.y + 5.2;
  options.rows.forEach((row) => {
    pdf.setFont("helvetica", row.emphasis ? "bold" : "normal");
    pdf.setFontSize(8.3);
    pdf.setTextColor(...PDF_COLORS.ink);
    pdf.text(row.label, options.x + 4, y);
    pdf.text(row.value, options.x + options.width - 4, y, { align: "right" });
    y += rowHeight;
  });
  if (options.total) {
    pdf.setDrawColor(...PDF_COLORS.primary);
    pdf.setLineWidth(0.4);
    pdf.line(options.x + 3, y - 3.5, options.x + options.width - 3, y - 3.5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.3);
    pdf.setTextColor(...PDF_COLORS.primary);
    pdf.text(options.total.label, options.x + 4, y + 1.8);
    pdf.text(options.total.value, options.x + options.width - 4, y + 1.8, { align: "right" });
  }
  return options.y + height;
}

export function SignatureBlock(pdf: jsPDF, options: { x: number; y: number; width: number; label: string; name?: string | null; signature?: SignatureImage | null }) {
  pdf.setTextColor(...PDF_COLORS.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.8);
  pdf.text(options.label.toUpperCase(), options.x, options.y);
  if (options.signature) addSignatureImage(pdf, options.signature, options.x + 2, options.y + 2, Math.min(42, options.width - 4), 8);
  pdf.setDrawColor(...PDF_COLORS.primary);
  pdf.setLineWidth(0.25);
  pdf.line(options.x, options.y + 13, options.x + options.width, options.y + 13);
  pdf.setTextColor(...PDF_COLORS.ink);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const nameLines = pdf.splitTextToSize(options.name?.trim() || "", options.width).slice(0, 2);
  pdf.text(nameLines, options.x, options.y + 18, { lineHeightFactor: 1.05 });
  return options.y + 24;
}

export function DocumentFooter(pdf: jsPDF, text = "Procurement Sys") {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = PDF_PAGE.margin;
  const footerPages = ((pdf as jsPDF & { __corporateFooterPages?: Set<number> }).__corporateFooterPages ??= new Set<number>());
  const pageNumber = pdf.getNumberOfPages();
  if (footerPages.has(pageNumber)) return;
  footerPages.add(pageNumber);
  pdf.setDrawColor(...PDF_COLORS.border);
  pdf.setLineWidth(0.2);
  pdf.line(margin, pageHeight - PDF_PAGE.footerHeight, pageWidth - margin, pageHeight - PDF_PAGE.footerHeight);
  pdf.setTextColor(...PDF_COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);
  pdf.text(text, margin, pageHeight - 4.3);
  pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 4.3, { align: "right" });
}

export function savePdf(pdf: jsPDF, filename: string) {
  pdf.save(safePdfFilename(filename));
}

export async function downloadCorporateTablePdf(title: string, headers: string[], rows: string[][]) {
  const orientation = headers.length > 6 ? "landscape" : "portrait";
  const pdf = createCorporatePdf(orientation);
  const logo = await loadCorporateLogo();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_PAGE.margin * 2;
  let y = CompanyHeader(pdf, { name: "NeatNest Organized Inventories" }, logo, { orientation });
  y = DocumentTitle(pdf, title, "Data export", y + 8);
  y = InfoBlock(pdf, { x: PDF_PAGE.margin, y, width: contentWidth, columns: 2, title: "Export metadata", items: [{ label: "Generated", value: formatPdfDateTime(new Date()) }, { label: "Rows", value: rows.length }] }) + 6;
  DataTable(pdf, { startY: y, headers, rows, onPage: () => DocumentFooter(pdf), fontSize: headers.length > 6 ? 7 : 8 });
  DocumentFooter(pdf);
  const filename = `${safePdfFilename(title || "data-export")}.pdf`;
  const url = URL.createObjectURL(pdf.output("blob"));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
