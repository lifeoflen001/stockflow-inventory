import { jsPDF } from "jspdf";
import { loadSignatureImage } from "@/lib/pdf-signature.ts";
import {
  loadCorporateLogo,
  safePdfFilename,
} from "@/lib/pdf-design-system.ts";

type PettyCashVoucher = {
  voucherNumber: string;
  issuedAt: string;
  collector: string;
  requiredFor: string;
  amount: number;
  currency: string;
  notes?: string | null;
  issuedBy?: {
    name?: string | null;
    signatureUrl?: string | null;
  } | null;
  signatureUrl?: string | null;
};

type Company = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  currency?: string;
};

/**
 * ============================================================================
 * OFFICIAL COMPANY DETAILS
 * ============================================================================
 */
const COMPANY = {
  name: "NeatNest Organized Inventories",
  address: "",
  phone: "-",
  email: "-",
};

/**
 * ============================================================================
 * A4 PAGE
 * ============================================================================
 *
 * The PDF page is full A4 portrait,
 * but the petty cash voucher itself stays compact near the top.
 */
const BLUE: [number, number, number] = [25, 91, 155];
const DARK_BLUE: [number, number, number] = [19, 72, 126];
const LIGHT_BLUE: [number, number, number] = [238, 245, 250];
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * ============================================================================
 * VOUCHER BLOCK INSIDE A4 PAGE
 * ============================================================================
 *
 * This preserves the compact petty cash size instead of stretching it.
 */
const VOUCHER = {
  x: 16,
  y: 16,
  width: 178,
  height: 95,
};

function vx(value: number) {
  return VOUCHER.x + value;
}

function vy(value: number) {
  return VOUCHER.y + value;
}

/* ============================================================================
 * FORMATTERS
 * ============================================================================
 */

function formatMoney(
  value: number,
  currency = "TSHS",
): string {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

  return `${currency} ${amount}`;
}

function formatDate(
  value?: string | null,
): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function setBlue(pdf: jsPDF) {
  pdf.setTextColor(...BLUE);
  pdf.setDrawColor(...BLUE);
}

/* ============================================================================
 * IMAGE HELPER
 * ============================================================================
 */

function addContainedImage(
  pdf: jsPDF,
  image: any,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (!image) return;

  try {
    const properties = pdf.getImageProperties(image);

    const sourceWidth = Number(properties?.width || maxWidth);
    const sourceHeight = Number(properties?.height || maxHeight);

    const ratio = sourceWidth / sourceHeight;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    const drawX = x + (maxWidth - width) / 2;
    const drawY = y + (maxHeight - height) / 2;

    const fileType = String(
      properties?.fileType || "PNG",
    ).toUpperCase();

    pdf.addImage(
      image,
      fileType,
      drawX,
      drawY,
      width,
      height,
    );
  } catch (error) {
    console.warn(
      "Unable to render image in petty cash PDF:",
      error,
    );
  }
}

/* ============================================================================
 * HEADER
 * ============================================================================
 */

function drawCompanyHeader(
  pdf: jsPDF,
  logo: any,
) {
  const x = vx(0);
  const y = vy(0);
  const width = VOUCHER.width;
  const height = 24;

  setBlue(pdf);

  pdf.setLineWidth(0.5);
  pdf.rect(x, y, width, height);

  /**
   * Smaller logo than before.
   */
  addContainedImage(
    pdf,
    logo,
    x + 4,
    y + 4.5,
    30,
    11,
  );

  const infoX = x + 42;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.4);
  pdf.setTextColor(...DARK_BLUE);
  pdf.text(COMPANY.name, infoX, y + 6.2);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);
  setBlue(pdf);

  pdf.text(COMPANY.address, infoX, y + 11.3);
  pdf.text(`Phone: ${COMPANY.phone}`, infoX, y + 15.4);
  pdf.text(`Email: ${COMPANY.email}`, infoX, y + 19.5);
}

/* ============================================================================
 * TITLE
 * ============================================================================
 */

function drawTitle(pdf: jsPDF) {
  setBlue(pdf);

  pdf.setFont("times", "bold");
  pdf.setFontSize(11.5);

  pdf.text(
    "PETTY CASH VOUCHER",
    vx(VOUCHER.width / 2),
    vy(31),
    { align: "center" },
  );
}

/* ============================================================================
 * COLLECTOR + DATE
 * ============================================================================
 */

function drawVoucherDetails(
  pdf: jsPDF,
  voucher: PettyCashVoucher,
) {
  const y = vy(39);

  setBlue(pdf);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);

  const beneficiaryLabel = "COLLECTOR/BENEFICIARY";

  pdf.text(beneficiaryLabel, vx(0), y);

  const labelWidth = pdf.getTextWidth(beneficiaryLabel);
  const beneficiaryStart = vx(labelWidth + 4);
  const beneficiaryEnd = vx(116);

  pdf.setLineWidth(0.28);
  pdf.line(
    beneficiaryStart,
    y + 0.9,
    beneficiaryEnd,
    y + 0.9,
  );

  if (voucher.collector) {
    pdf.setFillColor(...WHITE);
    pdf.rect(
      beneficiaryStart + 0.6,
      y - 3.3,
      beneficiaryEnd - beneficiaryStart - 1.2,
      3.9,
      "F",
    );

    setBlue(pdf);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);

    pdf.text(
      voucher.collector,
      beneficiaryStart + 1.1,
      y,
      {
        maxWidth: beneficiaryEnd - beneficiaryStart - 2,
      },
    );
  }

  const dateX = vx(131);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.text("DATE", dateX, y);

  const dateLineStart = vx(145);
  const dateLineEnd = vx(VOUCHER.width);

  pdf.line(
    dateLineStart,
    y + 0.9,
    dateLineEnd,
    y + 0.9,
  );

  const dateValue = formatDate(voucher.issuedAt);

  pdf.setFillColor(...WHITE);
  pdf.rect(
    dateLineStart + 0.6,
    y - 3.3,
    dateLineEnd - dateLineStart - 1.2,
    3.9,
    "F",
  );

  setBlue(pdf);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);

  pdf.text(dateValue, dateLineStart + 1.1, y);
}

/* ============================================================================
 * CASH REQUEST BOX
 * ============================================================================
 */

function drawCashRequest(
  pdf: jsPDF,
  voucher: PettyCashVoucher,
) {
  const x = vx(0);
  const y = vy(44);
  const width = VOUCHER.width;

  const headerHeight = 6.2;
  const bodyHeight = 20;
  const amountWidth = 43;

  const descriptionWidth = width - amountWidth;
  const dividerX = x + descriptionWidth;

  setBlue(pdf);

  pdf.setFillColor(...LIGHT_BLUE);
  pdf.rect(x, y, width, headerHeight, "F");

  pdf.setLineWidth(0.38);
  pdf.rect(x, y, width, headerHeight);
  pdf.line(dividerX, y, dividerX, y + headerHeight);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.9);

  pdf.text("REQUIRED FOR", x + 2.5, y + 4.2);

  pdf.text(
    "AMOUNT",
    dividerX + amountWidth / 2,
    y + 4.2,
    { align: "center" },
  );

  const bodyY = y + headerHeight;

  pdf.rect(x, bodyY, width, bodyHeight);
  pdf.line(dividerX, bodyY, dividerX, bodyY + bodyHeight);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);

  const description = pdf.splitTextToSize(
    voucher.requiredFor || "-",
    descriptionWidth - 5,
  );

  pdf.text(
    description.slice(0, 2),
    x + 2.5,
    bodyY + 5.5,
    { lineHeightFactor: 1.15 },
  );

  if (voucher.notes) {
    pdf.setFontSize(6.2);

    const notes = pdf.splitTextToSize(
      voucher.notes,
      descriptionWidth - 5,
    );

    pdf.text(
      notes.slice(0, 1),
      x + 2.5,
      bodyY + 12.5,
      { lineHeightFactor: 1.1 },
    );
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.2);

  pdf.text(
    formatMoney(
      voucher.amount,
      voucher.currency || "TSHS",
    ),
    x + width - 2.5,
    bodyY + 6.2,
    {
      align: "right",
      maxWidth: amountWidth - 5,
    },
  );
}

/* ============================================================================
 * NAME LINE
 * ============================================================================
 */

function drawNameLine(
  pdf: jsPDF,
  options: {
    label: string;
    name?: string | null;
    x: number;
    y: number;
    width: number;
  },
) {
  const { label, name, x, y, width } = options;

  setBlue(pdf);

  const labelText = label.toUpperCase();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.text(labelText, x, y);

  const labelWidth = pdf.getTextWidth(labelText);
  const lineStart = x + labelWidth + 2.8;
  const lineEnd = x + width;

  pdf.setLineWidth(0.28);
  pdf.line(lineStart, y + 0.8, lineEnd, y + 0.8);

  if (!name) return;

  pdf.setFillColor(...WHITE);
  pdf.rect(
    lineStart + 0.5,
    y - 3.1,
    lineEnd - lineStart - 1,
    3.7,
    "F",
  );

  setBlue(pdf);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);

  pdf.text(
    name,
    lineStart + 0.9,
    y,
    {
      maxWidth: lineEnd - lineStart - 2,
    },
  );
}

/* ============================================================================
 * SIGNATURE LINE
 * ============================================================================
 */

function drawSignatureLine(
  pdf: jsPDF,
  options: {
    x: number;
    y: number;
    width: number;
    signature?: any;
  },
) {
  const { x, y, width, signature } = options;

  setBlue(pdf);

  const label = "SIGNATURE";

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.text(label, x, y);

  const labelWidth = pdf.getTextWidth(label);
  const lineStart = x + labelWidth + 2.8;
  const lineEnd = x + width;

  pdf.setLineWidth(0.28);
  pdf.line(lineStart, y + 0.8, lineEnd, y + 0.8);

  if (signature) {
    addContainedImage(
      pdf,
      signature,
      lineStart + 2,
      y - 6,
      20,
      5.5,
    );
  }
}

/* ============================================================================
 * AUTHORIZATION SECTION
 * ============================================================================
 */

function drawAuthorizationSection(
  pdf: jsPDF,
  voucher: PettyCashVoucher,
  signature: any,
) {
  /**
   * REQUIRED FOR box ends at approximately VOUCHER Y + 70 mm.
   *
   * Names now begin at +80 mm, giving approximately
   * 10 mm of clean breathing room.
   */
  const nameY =
    vy(80);

  /**
   * Signature line underneath names.
   */
  const signatureY =
    vy(90);

  const leftX =
    vx(0);

  const rightX =
    vx(92);

  const leftWidth =
    80;

  const rightWidth =
    86;

  /**
   * ISSUED BY
   */
  drawNameLine(
    pdf,
    {
      label: "Issued By",

      name:
        voucher.issuedBy?.name ||
        "",

      x: leftX,

      y: nameY,

      width: leftWidth,
    },
  );

  /**
   * COLLECTED BY
   */
  drawNameLine(
    pdf,
    {
      label: "Collected By",

      name:
        voucher.collector ||
        "",

      x: rightX,

      y: nameY,

      width: rightWidth,
    },
  );

  /**
   * ISSUER SIGNATURE
   */
  drawSignatureLine(
    pdf,
    {
      x: leftX,

      y: signatureY,

      width: leftWidth,

      signature,
    },
  );

  /**
   * COLLECTOR SIGNATURE
   *
   * Blank so collector can sign manually.
   */
  drawSignatureLine(
    pdf,
    {
      x: rightX,

      y: signatureY,

      width: rightWidth,
    },
  );
}

/* ============================================================================
 * FOOTER
 * ============================================================================
 */

function drawFooter(
  pdf: jsPDF,
  voucher: PettyCashVoucher,
) {
  const y = vy(90.5);

  setBlue(pdf);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);

  pdf.text(
    `Voucher ${voucher.voucherNumber}`,
    vx(0),
    y,
  );

  pdf.text(
    "Petty Cash Control Copy",
    vx(VOUCHER.width),
    y,
    { align: "right" },
  );
}

/* ============================================================================
 * BUILD PDF
 * ============================================================================
 */

async function buildPettyCashPdf(
  voucher: PettyCashVoucher,
  _company?: Company,
) {
  /**
   * Full A4 portrait page.
   */
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const logo = await loadCorporateLogo();

  const signature = await loadSignatureImage(
    voucher.signatureUrl ??
      voucher.issuedBy?.signatureUrl,
  );

  drawCompanyHeader(pdf, logo);
  drawTitle(pdf);
  drawVoucherDetails(pdf, voucher);
  drawCashRequest(pdf, voucher);
  drawAuthorizationSection(pdf, voucher, signature);
  drawFooter(pdf, voucher);

  return {
    blob: pdf.output("blob"),
    filename: `${safePdfFilename(
      voucher.voucherNumber || "petty-cash-voucher",
    )}.pdf`,
  };
}

/* ============================================================================
 * PUBLIC API
 * ============================================================================
 */

export async function generatePettyCashPdf(
  voucher: PettyCashVoucher,
  company?: Company,
): Promise<Blob> {
  return (await buildPettyCashPdf(voucher, company)).blob;
}

export async function downloadPettyCashPdf(
  voucher: PettyCashVoucher,
  company?: Company,
): Promise<void> {
  const { blob, filename } = await buildPettyCashPdf(
    voucher,
    company,
  );

  const url = URL.createObjectURL(blob);

  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;

  window.document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
