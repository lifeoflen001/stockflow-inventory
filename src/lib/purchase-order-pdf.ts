import { loadSignatureImage } from "@/lib/pdf-signature.ts";
import pdfLogoAssetUrl from "@/assets/tanzania-specialist-logo.png";
import {
  createCorporatePdf,
  loadCorporateLogo,
  safePdfFilename,
} from "@/lib/pdf-design-system.ts";

/* ============================================================================
 * TYPES
 * ============================================================================
 */

type Company = {
  name?: string;
  is_active?: boolean;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tin?: string | null;
  vrn?: string | null;
  currency?: string;
};

type PurchaseOrder = {
  poNumber: string;
  createdAt: string;

  expectedDate?: string | null;
  notes?: string | null;
  purchaseReason?: string | null;

  subtotal: number;
  taxAmount: number;
  totalAmount: number;

  currency?: string | null;

  collectedBy?: string | null;
  approvedBy?: string | null;

  createdBy?: {
    name?: string | null;
  } | null;

  signatureName?: string | null;
  signatureUrl?: string | null;

  supplier?: {
    name?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;

  warehouse?: {
    name?: string;
  } | null;

  store?: {
    name?: string;
  } | null;

  receivingLocation?: {
    name?: string;
    type?: "store" | "warehouse";
  } | null;

  items: Array<{
    product?: {
      name?: string;
    } | null;

    orderedQty: number;
    unitCost: number;
    taxRate: number;
    total: number;
  }>;
};

/* ============================================================================
 * COMPANY LPO CONFIGURATION
 * ============================================================================
 */

const BLUE: [number, number, number] = [25, 91, 155];

const DARK_BLUE: [number, number, number] = [19, 72, 126];

const PO_RED: [number, number, number] = [155, 83, 83];

const WHITE: [number, number, number] = [255, 255, 255];

const TOTAL_BG: [number, number, number] = [242, 247, 251];

/**
 * Fallback logo URL.
 *
 * Put your logo here:
 *
 * public/images/tanzania-specialist-logo.png
 *
 * Browser URL becomes:
 *
 * /images/tanzania-specialist-logo.png
 */
const LOGO_URL = pdfLogoAssetUrl;

const PAGE = {
  width: 210,
  height: 297,
  left: 8,
  right: 8,
  top: 7,
  bottom: 8,
};

const CONTENT_WIDTH =
  PAGE.width - PAGE.left - PAGE.right;

/**
 * Final page needs 3 rows reserved for:
 *
 * Subtotal
 * VAT
 * TOTAL
 */
const MAX_ITEMS_FINAL_PAGE = 14;

/**
 * Continuation pages do not require totals.
 */
const MAX_ITEMS_CONTINUATION_PAGE = 17;

/* ============================================================================
 * FORMATTERS
 * ============================================================================
 */

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function quantity(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function dateDMY(
  value?: string | null,
): string {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const day = String(
    parsed.getDate(),
  ).padStart(2, "0");

  const month = String(
    parsed.getMonth() + 1,
  ).padStart(2, "0");

  const year =
    parsed.getFullYear();

  return `${day}/${month}/${year}`;
}

function setBlue(pdf: any) {
  pdf.setTextColor(...BLUE);
  pdf.setDrawColor(...BLUE);
}

/* ============================================================================
 * LOGO LOADER
 * ============================================================================
 */

/**
 * Uses the normal project logo loader first.
 *
 * If that fails, it falls back to:
 *
 * public/images/tanzania-specialist-logo.png
 */
async function loadLpoLogo() {
  try {
    const existing =
      await loadCorporateLogo();

    if (existing) {
      return existing;
    }
  } catch (error) {
    console.warn(
      "loadCorporateLogo() failed:",
      error,
    );
  }

  try {
    const response =
      await fetch(LOGO_URL);

    if (!response.ok) {
      throw new Error(
        `Logo request failed: ${response.status}`,
      );
    }

    const blob =
      await response.blob();

    return await new Promise<string>(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onloadend =
          () => {
            resolve(
              String(
                reader.result || "",
              ),
            );
          };

        reader.onerror =
          () => reject(
            reader.error,
          );

        reader.readAsDataURL(
          blob,
        );
      },
    );
  } catch (error) {
    console.warn(
      "Fallback LPO logo failed:",
      error,
    );

    return null;
  }
}

/* ============================================================================
 * IMAGE HELPER
 * ============================================================================
 */

/**
 * Draws logo/signature without stretching.
 */
function addContainedImage(
  pdf: any,
  image: any,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (!image) return;

  try {
    const properties =
      pdf.getImageProperties(
        image,
      );

    const sourceWidth =
      Number(
        properties?.width ||
          maxWidth,
      );

    const sourceHeight =
      Number(
        properties?.height ||
          maxHeight,
      );

    if (
      !sourceWidth ||
      !sourceHeight
    ) {
      return;
    }

    const ratio =
      sourceWidth /
      sourceHeight;

    let width =
      maxWidth;

    let height =
      width / ratio;

    if (
      height >
      maxHeight
    ) {
      height =
        maxHeight;

      width =
        height *
        ratio;
    }

    const drawX =
      x +
      (maxWidth -
        width) /
        2;

    const drawY =
      y +
      (maxHeight -
        height) /
        2;

    const fileType =
      String(
        properties?.fileType ||
          "PNG",
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
      "Unable to render PDF image:",
      error,
    );
  }
}

/* ============================================================================
 * COMPANY HEADER
 * ============================================================================
 */

function drawHeader(
  pdf: any,
  company: Company | undefined,
  logo: any,
) {
  const x =
    PAGE.left;

  const y =
    PAGE.top;

  const width =
    CONTENT_WIDTH;

  const height = 34;

  setBlue(pdf);

  /**
   * Header border.
   */
  pdf.setLineWidth(
    0.6,
  );

  pdf.rect(
    x,
    y,
    width,
    height,
  );

  /* --------------------------------------------------------------------------
   * COMPANY NAME
   * --------------------------------------------------------------------------
   */

  const companyName =
    company?.name?.trim() ||
    "R & M TANZANIA SPECIALIST LTD";

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    15,
  );

  pdf.text(
    companyName.toUpperCase(),
    PAGE.width / 2,
    y + 7,
    {
      align: "center",
      maxWidth:
        width - 12,
    },
  );

  /* --------------------------------------------------------------------------
   * LOGO
   * --------------------------------------------------------------------------
   *
   * Slightly larger than previous version,
   * but aspect ratio is maintained.
   */

  addContainedImage(
    pdf,
    logo,
    x + 10,
    y + 10,
    56,
    18,
  );

  /* --------------------------------------------------------------------------
   * COMPANY DETAILS
   * --------------------------------------------------------------------------
   */

  const infoX =
    x + 77;

  const infoY =
    y + 14;

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    8.3,
  );

  const address =
    company?.address ||
    "P.O Box 14276 Arusha, Tanzania.";

  const phone =
    company?.phone ||
    "255 786 447 455";

  const email =
    company?.email ||
    "booking@tanzaniaspecialist.com";

  pdf.text(
    address,
    infoX,
    infoY,
  );

  pdf.text(
    `Phone: ${phone}`,
    infoX,
    infoY + 5,
  );

  pdf.text(
    `Email: ${email}`,
    infoX,
    infoY + 10,
  );

  return (
    y + height
  );
}

/* ============================================================================
 * DOCUMENT TITLE
 * ============================================================================
 */

function drawDocumentHeading(
  pdf: any,
  company?: Company,
) {
  const titleY = 49;

  setBlue(pdf);

  pdf.setFont(
    "times",
    "bold",
  );

  pdf.setFontSize(
    13.5,
  );

  pdf.text(
    "LOCAL PURCHASE ORDER",
    PAGE.width / 2,
    titleY,
    {
      align: "center",
    },
  );

  /* --------------------------------------------------------------------------
   * TIN / VRN
   * --------------------------------------------------------------------------
   */

  const taxX = 165;

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    7.8,
  );

  pdf.text(
    `TIN: ${
      company?.tin ||
      "135 - 035 - 505"
    }`,
    taxX,
    titleY - 1,
  );

  pdf.text(
    `VRN: ${
      company?.vrn ||
      "40-028394-B"
    }`,
    taxX,
    titleY + 5,
  );
}

/* ============================================================================
 * STANDARD UNDERLINED FIELD
 * ============================================================================
 */

function drawFieldLine(
  pdf: any,
  options: {
    label: string;
    value?: string | null;
    x: number;
    y: number;
    lineStartX: number;
    lineEndX: number;
    boldValue?: boolean;
    fontSize?: number;
  },
) {
  const {
    label,
    value,
    x,
    y,
    lineStartX,
    lineEndX,
    boldValue = false,
    fontSize = 8.5,
  } = options;

  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    fontSize,
  );

  pdf.text(
    label,
    x,
    y,
  );

  pdf.setLineWidth(
    0.32,
  );

  pdf.line(
    lineStartX,
    y + 1,
    lineEndX,
    y + 1,
  );

  if (!value) {
    return;
  }

  const availableWidth =
    lineEndX -
    lineStartX -
    3;

  /**
   * White-out the underline underneath text.
   */
  pdf.setFillColor(
    ...WHITE,
  );

  pdf.rect(
    lineStartX + 1,
    y - 4,
    availableWidth,
    4.8,
    "F",
  );

  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    boldValue
      ? "bold"
      : "normal",
  );

  pdf.setFontSize(
    fontSize,
  );

  pdf.text(
    value,
    lineStartX +
      1.5,
    y,
    {
      maxWidth:
        availableWidth -
        1,
    },
  );
}

/* ============================================================================
 * SUPPLIER + PO INFORMATION
 * ============================================================================
 */

function drawSupplierAndOrderDetails(
  pdf: any,
  order: PurchaseOrder,
) {
  const leftX =
    PAGE.left;

  const supplierLineStart =
    46;

  const supplierLineEnd =
    139;

  /* --------------------------------------------------------------------------
   * SUPPLIER NAME
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Name of Company",

      value:
        order.supplier
          ?.name || "",

      x: leftX,

      y: 63,

      lineStartX:
        supplierLineStart,

      lineEndX:
        supplierLineEnd,
    },
  );

  /* --------------------------------------------------------------------------
   * ADDRESS
   *
   * One line only.
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Address",

      value:
        order.supplier
          ?.address || "",

      x: leftX,

      y: 73,

      lineStartX:
        supplierLineStart,

      lineEndX:
        supplierLineEnd,
    },
  );

  /* --------------------------------------------------------------------------
   * PO NUMBER
   * --------------------------------------------------------------------------
   */

  const rightX = 145;

  pdf.setTextColor(
    ...DARK_BLUE,
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    10,
  );

  pdf.text(
    "No.",
    rightX,
    64,
  );

  pdf.setTextColor(
    ...PO_RED,
  );

  pdf.setFont(
    "courier",
    "normal",
  );

  pdf.setFontSize(
    10.5,
  );

  pdf.text(
    order.poNumber || "",
    rightX + 12,
    64,
    {
      maxWidth: 43,
    },
  );

  /* --------------------------------------------------------------------------
   * DATE DIRECTLY BELOW PO NUMBER
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Date:",

      value:
        dateDMY(
          order.createdAt,
        ),

      x: rightX,

      y: 74,

      lineStartX:
        rightX + 15,

      lineEndX:
        PAGE.width -
        PAGE.right,

      boldValue:
        true,

      fontSize: 8,
    },
  );
}

/* ============================================================================
 * TABLE TYPES
 * ============================================================================
 */

type TableRow = {
  item: string;
  description: string;
  qty: string;
  unitPrice: string;
  total: string;

  type?:
    | "item"
    | "empty"
    | "subtotal"
    | "vat"
    | "total";
};

/* ============================================================================
 * ORDER TOTALS
 * ============================================================================
 */

function calculateOrderTotals(
  order: PurchaseOrder,
) {
  const calculatedSubtotal =
    order.items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        Number(
          item.orderedQty ||
            0,
        ) *
          Number(
            item.unitCost ||
              0,
          ),
      0,
    );

  const subtotal =
    Number.isFinite(
      Number(
        order.subtotal,
      ),
    )
      ? Number(
          order.subtotal,
        )
      : calculatedSubtotal;

  const calculatedTax =
    order.items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        Number(
          item.orderedQty ||
            0,
        ) *
          Number(
            item.unitCost ||
              0,
          ) *
          (
            Number(
              item.taxRate ||
                0,
            ) / 100
          ),
      0,
    );

  const taxAmount =
    Number.isFinite(
      Number(
        order.taxAmount,
      ),
    )
      ? Number(
          order.taxAmount,
        )
      : calculatedTax;

  const total =
    Number.isFinite(
      Number(
        order.totalAmount,
      ),
    )
      ? Number(
          order.totalAmount,
        )
      : subtotal +
        taxAmount;

  return {
    subtotal,
    taxAmount,
    total,
  };
}

/* ============================================================================
 * BUILD TABLE ROWS
 * ============================================================================
 */

function buildTableRows(
  order: PurchaseOrder,
  pageItems:
    PurchaseOrder["items"],
  isFinalPage: boolean,
  totalSlots: number,
  itemOffset = 0,
): TableRow[] {
  const rows:
    TableRow[] = [];

  pageItems.forEach(
    (
      item,
      index,
    ) => {
      const lineTotal =
        Number(
          item.orderedQty ||
            0,
        ) *
        Number(
          item.unitCost ||
            0,
        );

      rows.push({
        item:
          String(
            itemOffset +
            index +
            1,
          ),

        description:
          item.product
            ?.name ||
          "-",

        qty:
          quantity(
            item.orderedQty,
          ),

        unitPrice:
          money(
            item.unitCost,
          ),

        total:
          money(
            lineTotal,
          ),

        type:
          "item",
      });
    },
  );

  /* --------------------------------------------------------------------------
   * CONTINUATION PAGE
   * --------------------------------------------------------------------------
   */

  if (
    !isFinalPage
  ) {
    while (
      rows.length <
      totalSlots
    ) {
      rows.push({
        item: "",
        description: "",
        qty: "",
        unitPrice: "",
        total: "",
        type: "empty",
      });
    }

    return rows;
  }

  /* --------------------------------------------------------------------------
   * FINAL PAGE BLANK ROWS
   * --------------------------------------------------------------------------
   */

  const blankRows =
    Math.max(
      0,
      totalSlots -
        rows.length -
        3,
    );

  for (
    let index = 0;
    index < blankRows;
    index++
  ) {
    rows.push({
      item: "",
      description: "",
      qty: "",
      unitPrice: "",
      total: "",
      type: "empty",
    });
  }

  const {
    subtotal,
    taxAmount,
    total,
  } =
    calculateOrderTotals(
      order,
    );

  /* --------------------------------------------------------------------------
   * VAT LABEL
   * --------------------------------------------------------------------------
   */

  const taxRates =
    Array.from(
      new Set(
        order.items.map(
          (item) =>
            Number(
              item.taxRate ||
                0,
            ),
        ),
      ),
    );

  const vatLabel =
    taxRates.length ===
    1
      ? `${taxRates[0]}% VAT`
      : "VAT";

  /* --------------------------------------------------------------------------
   * TOTAL ROWS
   * --------------------------------------------------------------------------
   */

  rows.push({
    item: "",
    description: "",
    qty: "",
    unitPrice:
      "Subtotal",
    total:
      money(
        subtotal,
      ),
    type:
      "subtotal",
  });

  rows.push({
    item: "",
    description: "",
    qty: "",
    unitPrice:
      vatLabel,
    total:
      money(
        taxAmount,
      ),
    type:
      "vat",
  });

  rows.push({
    item: "",
    description: "",
    qty: "",
    unitPrice:
      "TOTAL",
    total:
      money(
        total,
      ),
    type:
      "total",
  });

  return rows;
}

/* ============================================================================
 * DRAW ITEM TABLE
 * ============================================================================
 */

function drawItemsTable(
  pdf: any,
  rows: TableRow[],
) {
  const x =
    PAGE.left;

  /**
   * Increased slightly from 84 → 88.
   *
   * This gives more breathing room above
   * "PLEASE SUPPLY THE FOLLOWING GOODS".
   */
  const startY = 88;

  setBlue(pdf);

  /* --------------------------------------------------------------------------
   * TABLE TITLE
   * --------------------------------------------------------------------------
   */

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    9.4,
  );

  pdf.text(
    "PLEASE SUPPLY THE FOLLOWING GOODS",
    x,
    startY - 4,
  );

  /* --------------------------------------------------------------------------
   * COLUMN WIDTHS
   * --------------------------------------------------------------------------
   */

  const widths = {
    item: 16,
    description: 88,
    qty: 22,
    unitPrice: 32,
    total: 36,
  };

  const xs = [
    x,

    x +
      widths.item,

    x +
      widths.item +
      widths.description,

    x +
      widths.item +
      widths.description +
      widths.qty,

    x +
      widths.item +
      widths.description +
      widths.qty +
      widths.unitPrice,

    x +
      CONTENT_WIDTH,
  ];

  const headerHeight =
    9;

  const rowHeight =
    7;

  /* --------------------------------------------------------------------------
   * TABLE HEADER BORDER
   * --------------------------------------------------------------------------
   */

  pdf.setLineWidth(
    0.45,
  );

  pdf.rect(
    x,
    startY,
    CONTENT_WIDTH,
    headerHeight,
  );

  for (
    let index = 1;
    index <
    xs.length - 1;
    index++
  ) {
    pdf.line(
      xs[index],
      startY,
      xs[index],
      startY +
        headerHeight,
    );
  }

  /* --------------------------------------------------------------------------
   * TABLE HEADINGS
   * --------------------------------------------------------------------------
   */

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    7.7,
  );

  const headerY =
    startY + 5.8;

  pdf.text(
    "Item",
    (xs[0] +
      xs[1]) /
      2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Description",
    (xs[1] +
      xs[2]) /
      2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Qty",
    (xs[2] +
      xs[3]) /
      2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Unit Price",
    (xs[3] +
      xs[4]) /
      2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Total",
    (xs[4] +
      xs[5]) /
      2,
    headerY,
    {
      align:
        "center",
    },
  );

  /* --------------------------------------------------------------------------
   * DATA ROWS
   * --------------------------------------------------------------------------
   */

  let currentY =
    startY +
    headerHeight;

  rows.forEach(
    (row) => {
      const isTotal =
        row.type ===
        "total";

      const isSummary =
        row.type ===
          "subtotal" ||
        row.type ===
          "vat" ||
        row.type ===
          "total";

      /**
       * Light background for grand total.
       */
      if (isTotal) {
        pdf.setFillColor(
          ...TOTAL_BG,
        );

        pdf.rect(
          xs[3],
          currentY,
          widths.unitPrice +
            widths.total,
          rowHeight,
          "F",
        );
      }

      /**
       * Full row border.
       */
      pdf.setDrawColor(
        ...BLUE,
      );

      pdf.setLineWidth(
        isTotal
          ? 0.55
          : 0.35,
      );

      pdf.rect(
        x,
        currentY,
        CONTENT_WIDTH,
        rowHeight,
      );

      /**
       * Column separators.
       */
      for (
        let index = 1;
        index <
        xs.length - 1;
        index++
      ) {
        pdf.line(
          xs[index],
          currentY,
          xs[index],
          currentY +
            rowHeight,
        );
      }

      pdf.setTextColor(
        ...BLUE,
      );

      pdf.setFont(
        "helvetica",
        isSummary
          ? "bold"
          : "normal",
      );

      pdf.setFontSize(
        7.6,
      );

      const textY =
        currentY +
        4.7;

      /* ----------------------------------------------------------------------
       * ITEM NUMBER
       * ----------------------------------------------------------------------
       */

      if (row.item) {
        pdf.text(
          row.item,
          (
            xs[0] +
            xs[1]
          ) / 2,
          textY,
          {
            align:
              "center",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * DESCRIPTION
       * ----------------------------------------------------------------------
       */

      if (
        row.description
      ) {
        const description =
          pdf.splitTextToSize(
            row.description,
            widths.description -
              4,
          );

        pdf.text(
          description.slice(
            0,
            1,
          ),
          xs[1] + 2,
          textY,
        );
      }

      /* ----------------------------------------------------------------------
       * QUANTITY
       * ----------------------------------------------------------------------
       */

      if (row.qty) {
        pdf.text(
          row.qty,
          (
            xs[2] +
            xs[3]
          ) / 2,
          textY,
          {
            align:
              "center",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * UNIT PRICE
       * ----------------------------------------------------------------------
       */

      if (
        row.unitPrice
      ) {
        pdf.text(
          row.unitPrice,
          xs[4] - 2,
          textY,
          {
            align:
              "right",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * TOTAL
       * ----------------------------------------------------------------------
       */

      if (row.total) {
        pdf.text(
          row.total,
          xs[5] - 2,
          textY,
          {
            align:
              "right",
          },
        );
      }

      currentY +=
        rowHeight;
    },
  );

  /**
   * Return table bottom.
   *
   * Used to dynamically position signature area.
   */
  return currentY;
}

/* ============================================================================
 * SIGNATURE MATCHING
 * ============================================================================
 */

function signatureMatches(
  signature: any,
  signatureName?:
    | string
    | null,
  personName?:
    | string
    | null,
) {
  return Boolean(
    signature &&
      signatureName &&
      personName &&
      signatureName
        .trim()
        .toLowerCase() ===
        personName
          .trim()
          .toLowerCase(),
  );
}

/* ============================================================================
 * NAME FIELD
 * ============================================================================
 */

function drawNameLine(
  pdf: any,
  options: {
    label: string;
    name?: string | null;
    x: number;
    y: number;
    width: number;
  },
) {
  const {
    label,
    name,
    x,
    y,
    width,
  } = options;

  setBlue(pdf);

  const upperLabel =
    label.toUpperCase();

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    8.2,
  );

  pdf.text(
    upperLabel,
    x,
    y,
  );

  const labelWidth =
    pdf.getTextWidth(
      upperLabel,
    );

  const lineStart =
    x +
    labelWidth +
    4;

  const lineEnd =
    x +
    width;

  pdf.setLineWidth(
    0.38,
  );

  pdf.line(
    lineStart,
    y + 1,
    lineEnd,
    y + 1,
  );

  if (!name) {
    return;
  }

  const available =
    lineEnd -
    lineStart -
    2;

  /**
   * Cover underline beneath name.
   */
  pdf.setFillColor(
    ...WHITE,
  );

  pdf.rect(
    lineStart + 1,
    y - 4,
    available,
    4.8,
    "F",
  );

  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    8,
  );

  pdf.text(
    name,
    lineStart +
      1.5,
    y,
    {
      maxWidth:
        available -
        2,
    },
  );
}

/* ============================================================================
 * SIGNATURE FIELD
 * ============================================================================
 */

function drawSignatureLine(
  pdf: any,
  options: {
    x: number;
    y: number;
    width: number;
    signature?: any;
  },
) {
  const {
    x,
    y,
    width,
    signature,
  } = options;

  setBlue(pdf);

  const label =
    "SIGNATURE";

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    8.2,
  );

  pdf.text(
    label,
    x,
    y,
  );

  const labelWidth =
    pdf.getTextWidth(
      label,
    );

  const lineStart =
    x +
    labelWidth +
    4;

  const lineEnd =
    x +
    width;

  pdf.setLineWidth(
    0.38,
  );

  pdf.line(
    lineStart,
    y + 1,
    lineEnd,
    y + 1,
  );

  /**
   * Digital signature is placed ABOVE the signature line.
   */
  if (signature) {
    addContainedImage(
      pdf,
      signature,
      lineStart +
        3,
      y - 8,
      Math.min(
        27,
        lineEnd -
          lineStart -
          5,
      ),
      7,
    );
  }
}

/* ============================================================================
 * APPROVAL AREA
 * ============================================================================
 */

function drawApprovalArea(
  pdf: any,
  order: PurchaseOrder,
  signature: any,
  tableEndY: number,
) {
  const leftX =
    PAGE.left;

  const rightX =
    109;

  const leftWidth =
    88;

  const rightWidth =
    93;

  const authorizedName =
    order.createdBy
      ?.name || "";

  const approvedName =
    order.approvedBy ||
    "";

  const authorizedSignature =
    signatureMatches(
      signature,
      order.signatureName,
      authorizedName,
    )
      ? signature
      : undefined;

  const approvedSignature =
    signatureMatches(
      signature,
      order.signatureName,
      approvedName,
    )
      ? signature
      : undefined;

  /**
   * ==========================================================================
   * DYNAMIC POSITIONING
   * ==========================================================================
   *
   * Instead of leaving a huge fixed blank area, the approval section
   * begins shortly after the table.
   */

  let nameY =
    tableEndY + 11;

  /**
   * Keep a safe minimum.
   */
  nameY =
    Math.max(
      nameY,
      224,
    );

  /**
   * Prevent the collected-by line from falling off A4 page.
   */
  nameY =
    Math.min(
      nameY,
      244,
    );

  const signatureY =
    nameY + 10;

  const collectedY =
    signatureY + 15;

  /* --------------------------------------------------------------------------
   * AUTHORIZED BY - LEFT
   * --------------------------------------------------------------------------
   */

  drawNameLine(
    pdf,
    {
      label:
        "Authorized By",

      name:
        authorizedName,

      x:
        leftX,

      y:
        nameY,

      width:
        leftWidth,
    },
  );

  drawSignatureLine(
    pdf,
    {
      x:
        leftX,

      y:
        signatureY,

      width:
        leftWidth,

      signature:
        authorizedSignature,
    },
  );

  /* --------------------------------------------------------------------------
   * APPROVED BY - RIGHT
   * --------------------------------------------------------------------------
   */

  drawNameLine(
    pdf,
    {
      label:
        "Approved By",

      name:
        approvedName,

      x:
        rightX,

      y:
        nameY,

      width:
        rightWidth,
    },
  );

  drawSignatureLine(
    pdf,
    {
      x:
        rightX,

      y:
        signatureY,

      width:
        rightWidth,

      signature:
        approvedSignature,
    },
  );

  /* --------------------------------------------------------------------------
   * COLLECTED BY - BOTTOM CENTRE
   *
   * No signature field.
   * --------------------------------------------------------------------------
   */

  drawNameLine(
    pdf,
    {
      label:
        "Collected By",

      name:
        order.collectedBy ||
        "",

      x:
        53,

      y:
        collectedY,

      width:
        106,
    },
  );
}

/* ============================================================================
 * CONTINUATION PAGE LABEL
 * ============================================================================
 */

function drawContinuationLabel(
  pdf: any,
  pageNumber: number,
) {
  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    6.8,
  );

  pdf.text(
    `Continued — Page ${pageNumber}`,
    PAGE.width -
      PAGE.right,
    83,
    {
      align:
        "right",
    },
  );
}

/* ============================================================================
 * SPLIT ITEMS INTO PAGES
 * ============================================================================
 */

function splitItemsForPages(
  items:
    PurchaseOrder["items"],
) {
  /**
   * Simple one-page PO.
   */
  if (
    items.length <=
    MAX_ITEMS_FINAL_PAGE
  ) {
    return [
      items,
    ];
  }

  const pages:
    PurchaseOrder["items"][] =
    [];

  let remaining =
    [...items];

  /**
   * Always leave final page with enough space for totals.
   */
  while (
    remaining.length >
    MAX_ITEMS_FINAL_PAGE
  ) {
    const amountForPage =
      Math.min(
        MAX_ITEMS_CONTINUATION_PAGE,
        remaining.length -
          MAX_ITEMS_FINAL_PAGE,
      );

    pages.push(
      remaining.slice(
        0,
        amountForPage,
      ),
    );

    remaining =
      remaining.slice(
        amountForPage,
      );
  }

  pages.push(
    remaining,
  );

  return pages;
}

/* ============================================================================
 * BUILD PDF
 * ============================================================================
 */

async function buildPurchaseOrderPdf(
  order: PurchaseOrder,
  company?: Company,
) {
  const pdf =
    createCorporatePdf(
      "portrait",
    );

  /* --------------------------------------------------------------------------
   * LOAD LOGO
   * --------------------------------------------------------------------------
   */

  const logo =
    await loadLpoLogo();

  /* --------------------------------------------------------------------------
   * LOAD DIGITAL SIGNATURE
   * --------------------------------------------------------------------------
   */

  const signature =
    await loadSignatureImage(
      order.signatureUrl,
    );

  /* --------------------------------------------------------------------------
   * PREPARE ITEM PAGES
   * --------------------------------------------------------------------------
   */

  const pages =
    splitItemsForPages(
      order.items || [],
    );

  let itemOffset = 0;

  pages.forEach(
    (
      pageItems,
      pageIndex,
    ) => {
      if (
        pageIndex >
        0
      ) {
        pdf.addPage();
      }

      const finalPage =
        pageIndex ===
        pages.length - 1;

      /* ----------------------------------------------------------------------
       * HEADER
       * ----------------------------------------------------------------------
       */

      drawHeader(
        pdf,
        company,
        logo,
      );

      /* ----------------------------------------------------------------------
       * TITLE / TAX INFORMATION
       * ----------------------------------------------------------------------
       */

      drawDocumentHeading(
        pdf,
        company,
      );

      /* ----------------------------------------------------------------------
       * SUPPLIER / PO / DATE
       * ----------------------------------------------------------------------
       */

      drawSupplierAndOrderDetails(
        pdf,
        order,
      );

      if (
        pageIndex > 0
      ) {
        drawContinuationLabel(
          pdf,
          pageIndex + 1,
        );
      }

      /* ----------------------------------------------------------------------
       * TABLE
       * ----------------------------------------------------------------------
       */

      const totalSlots =
        finalPage
          ? MAX_ITEMS_FINAL_PAGE +
            3
          : MAX_ITEMS_CONTINUATION_PAGE;

      const rows =
        buildTableRows(
          order,
          pageItems,
          finalPage,
          totalSlots,
          itemOffset,
        );

      const tableEndY =
        drawItemsTable(
          pdf,
          rows,
        );

      itemOffset +=
        pageItems.length;

      /* ----------------------------------------------------------------------
       * SIGNATURES
       * ----------------------------------------------------------------------
       */

      if (
        finalPage
      ) {
        drawApprovalArea(
          pdf,
          order,
          signature,
          tableEndY,
        );
      }
    },
  );

  /* --------------------------------------------------------------------------
   * OUTPUT
   * --------------------------------------------------------------------------
   */

  return {
    blob:
      pdf.output(
        "blob",
      ),

    filename:
      `${safePdfFilename(
        order.poNumber ||
          "purchase-order",
      )}.pdf`,
  };
}

/* ============================================================================
 * GENERATE PDF
 * ============================================================================
 */

export async function generatePurchaseOrderPdf(
  order: PurchaseOrder,
  company?: Company,
): Promise<Blob> {
  return (
    await buildPurchaseOrderPdf(
      order,
      company,
    )
  ).blob;
}

/* ============================================================================
 * DOWNLOAD PDF
 * ============================================================================
 */

export async function downloadPurchaseOrderPdf(
  order: PurchaseOrder,
  company?: Company,
): Promise<void> {
  const {
    blob,
    filename,
  } =
    await buildPurchaseOrderPdf(
      order,
      company,
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    window.document.createElement(
      "a",
    );

  link.href =
    url;

  link.download =
    filename;

  /**
   * Append before click for better cross-browser reliability.
   */
  window.document.body.appendChild(
    link,
  );

  link.click();

  link.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    1000,
  );
}
