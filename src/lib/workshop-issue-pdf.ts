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

type IssuePdf = {
  reference: string;

  issuedAt?: string | null;

  warehouse?: {
    name?: string | null;
  } | null;

  vehicle?: {
    registrationNumber?: string | null;
    make?: string | null;
    model?: string | null;
  } | null;

  collector?: {
    name?: string | null;
    staffNumber?: string | null;
  } | null;

  issuedBy?: string | null;

  issuedBySignatureUrl?: string | null;

  purpose?: string | null;

  notes?: string | null;

  items: Array<{
    product?: {
      name?: string | null;
      sku?: string | null;
    } | null;

    quantityBefore: number;

    quantityOut: number;

    quantityAfter: number;

    unit?: string | null;

    comment?: string | null;
  }>;
};

type Company = {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  tin?: string | null;
  vrn?: string | null;
};

/* ============================================================================
 * DOCUMENT CONFIGURATION
 * ============================================================================
 */

const BLUE: [number, number, number] = [25, 91, 155];

const DARK_BLUE: [number, number, number] = [19, 72, 126];

const REF_RED: [number, number, number] = [155, 83, 83];

const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Put the company logo here:
 *
 * public/images/tanzania-specialist-logo.png
 *
 * It will then be available as:
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
 * Same general density as the company LPO.
 */
const TABLE_ROWS_PER_PAGE = 16;

/**
 * More space above:
 *
 * PLEASE ISSUE THE FOLLOWING GOODS
 */
const TABLE_START_Y = 95;

/* ============================================================================
 * FORMATTERS
 * ============================================================================
 */

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const year = date.getFullYear();

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
 * First uses your normal corporate logo loader.
 *
 * If it cannot return the logo, the PDF uses:
 *
 * /images/tanzania-specialist-logo.png
 */
async function loadIssueLogo() {
  try {
    const existingLogo =
      await loadCorporateLogo();

    if (existingLogo) {
      return existingLogo;
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
        `Logo request failed with status ${response.status}`,
      );
    }

    const blob =
      await response.blob();

    return await new Promise<string>(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onloadend = () => {
          resolve(
            String(
              reader.result || "",
            ),
          );
        };

        reader.onerror = () => {
          reject(
            reader.error,
          );
        };

        reader.readAsDataURL(
          blob,
        );
      },
    );
  } catch (error) {
    console.warn(
      "Warehouse Issue fallback logo failed:",
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
 * Draws logos/signatures without stretching them.
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
      "Unable to render Warehouse Issue PDF image:",
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

  /* --------------------------------------------------------------------------
   * HEADER BORDER
   * --------------------------------------------------------------------------
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

  const address =
    company?.address ||
    "P.O Box 14276 Arusha, Tanzania.";

  const phone =
    company?.phone ||
    "255 786 447 455";

  const email =
    company?.email ||
    "booking@tanzaniaspecialist.com";

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    8.3,
  );

  setBlue(pdf);

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
}

/* ============================================================================
 * DOCUMENT TITLE
 * ============================================================================
 */

function drawTitle(
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
    "WORKSHOP WAREHOUSE ISSUE NOTE",
    PAGE.width / 2,
    titleY,
    {
      align: "center",
    },
  );

  /* --------------------------------------------------------------------------
   * TAX DETAILS
   *
   * Same position and style as LPO.
   * --------------------------------------------------------------------------
   */

  const taxX = 165;

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    7.5,
  );

  if (company?.tin) {
    pdf.text(
      `TIN: ${company.tin}`,
      taxX,
      titleY - 1,
    );
  }

  if (company?.vrn) {
    pdf.text(
      `VRN: ${company.vrn}`,
      taxX,
      titleY + 5,
    );
  }
}

/* ============================================================================
 * UNDERLINED FIELD
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
    fontSize = 8.2,
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
    0.3,
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

  const available =
    lineEndX -
    lineStartX -
    3;

  /**
   * Hide underline beneath printed value.
   */
  pdf.setFillColor(
    ...WHITE,
  );

  pdf.rect(
    lineStartX + 1,
    y - 4,
    available,
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
        available -
        1,
    },
  );
}

/* ============================================================================
 * ISSUE INFORMATION
 * ============================================================================
 */

function drawIssueDetails(
  pdf: any,
  issue: IssuePdf,
) {
  const leftX =
    PAGE.left;

  const lineStart =
    34;

  const lineEnd =
    139;

  /* --------------------------------------------------------------------------
   * WAREHOUSE
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Warehouse",

      value:
        issue.warehouse
          ?.name || "",

      x:
        leftX,

      y:
        62,

      lineStartX:
        lineStart,

      lineEndX:
        lineEnd,
    },
  );

  /* --------------------------------------------------------------------------
   * VEHICLE
   * --------------------------------------------------------------------------
   */

  const vehicle =
    [
      issue.vehicle
        ?.registrationNumber,

      issue.vehicle
        ?.make,

      issue.vehicle
        ?.model,
    ]
      .filter(Boolean)
      .join(" - ");

  drawFieldLine(
    pdf,
    {
      label:
        "Vehicle",

      value:
        vehicle,

      x:
        leftX,

      y:
        71,

      lineStartX:
        lineStart,

      lineEndX:
        lineEnd,
    },
  );

  /* --------------------------------------------------------------------------
   * PURPOSE
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Purpose",

      value:
        issue.purpose ||
        "",

      x:
        leftX,

      y:
        80,

      lineStartX:
        lineStart,

      lineEndX:
        lineEnd,
    },
  );

  /* --------------------------------------------------------------------------
   * ISSUE REFERENCE
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
    9.5,
  );

  pdf.text(
    "No.",
    rightX,
    63,
  );

  pdf.setTextColor(
    ...REF_RED,
  );

  pdf.setFont(
    "courier",
    "normal",
  );

  pdf.setFontSize(
    9.3,
  );

  pdf.text(
    issue.reference ||
    "",
    rightX + 12,
    63,
    {
      maxWidth: 43,
    },
  );

  /* --------------------------------------------------------------------------
   * DATE
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Date:",

      value:
        formatDate(
          issue.issuedAt,
        ),

      x:
        rightX,

      y:
        72,

      lineStartX:
        rightX +
        15,

      lineEndX:
        PAGE.width -
        PAGE.right,

      boldValue:
        true,

      fontSize:
        7.8,
    },
  );

  /* --------------------------------------------------------------------------
   * STAFF NUMBER
   * --------------------------------------------------------------------------
   */

  drawFieldLine(
    pdf,
    {
      label:
        "Staff No:",

      value:
        issue.collector
          ?.staffNumber ||
        "",

      x:
        rightX,

      y:
        81,

      lineStartX:
        rightX +
        22,

      lineEndX:
        PAGE.width -
        PAGE.right,

      fontSize:
        7.5,
    },
  );
}

/* ============================================================================
 * TABLE TYPES
 * ============================================================================
 */

type TableRow = {
  no: string;

  description: string;

  available: string;

  issued: string;

  balance: string;

  unit: string;

  comment: string;
};

/* ============================================================================
 * BUILD TABLE ROWS
 * ============================================================================
 */

function buildRows(
  items: IssuePdf["items"],
  itemOffset: number,
): TableRow[] {
  const rows =
    items.map(
      (
        item,
        index,
      ) => {
        let description =
          item.product
            ?.name ||
          "-";

        /**
         * Keep SKU compact on same line.
         */
        if (
          item.product
            ?.sku
        ) {
          description +=
            ` (${item.product.sku})`;
        }

        return {
          no:
            String(
              itemOffset +
              index +
              1,
            ),

          description,

          available:
            formatQuantity(
              item.quantityBefore,
            ),

          issued:
            formatQuantity(
              item.quantityOut,
            ),

          balance:
            formatQuantity(
              item.quantityAfter,
            ),

          unit:
            item.unit ||
            "",

          comment:
            item.comment ||
            "",
        };
      },
    );

  /**
   * Preserve traditional blank rows like the LPO.
   */
  while (
    rows.length <
    TABLE_ROWS_PER_PAGE
  ) {
    rows.push({
      no: "",
      description: "",
      available: "",
      issued: "",
      balance: "",
      unit: "",
      comment: "",
    });
  }

  return rows;
}

/* ============================================================================
 * ISSUE TABLE
 * ============================================================================
 */

function drawIssueTable(
  pdf: any,
  rows: TableRow[],
) {
  const x =
    PAGE.left;

  const startY =
    TABLE_START_Y;

  setBlue(pdf);

  /* --------------------------------------------------------------------------
   * TABLE TITLE
   *
   * Increased space above it compared with previous version.
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
    "PLEASE ISSUE THE FOLLOWING GOODS",
    x,
    startY - 4,
  );

  /* --------------------------------------------------------------------------
   * COLUMN WIDTHS
   *
   * Total = 194 mm
   * --------------------------------------------------------------------------
   */

  const widths = {
    no: 12,

    description: 62,

    available: 23,

    issued: 20,

    balance: 23,

    unit: 18,

    comment: 36,
  };

  const xs = [
    x,

    x +
      widths.no,

    x +
      widths.no +
      widths.description,

    x +
      widths.no +
      widths.description +
      widths.available,

    x +
      widths.no +
      widths.description +
      widths.available +
      widths.issued,

    x +
      widths.no +
      widths.description +
      widths.available +
      widths.issued +
      widths.balance,

    x +
      widths.no +
      widths.description +
      widths.available +
      widths.issued +
      widths.balance +
      widths.unit,

    x +
      CONTENT_WIDTH,
  ];

  const headerHeight =
    9;

  const rowHeight =
    7;

  /* --------------------------------------------------------------------------
   * HEADER BORDER
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
   * HEADER TEXT
   * --------------------------------------------------------------------------
   */

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    7,
  );

  const headerY =
    startY +
    5.8;

  pdf.text(
    "No.",
    (
      xs[0] +
      xs[1]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Description",
    (
      xs[1] +
      xs[2]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Available",
    (
      xs[2] +
      xs[3]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Issued",
    (
      xs[3] +
      xs[4]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Balance",
    (
      xs[4] +
      xs[5]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Unit",
    (
      xs[5] +
      xs[6]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  pdf.text(
    "Comment",
    (
      xs[6] +
      xs[7]
    ) / 2,
    headerY,
    {
      align:
        "center",
    },
  );

  /* --------------------------------------------------------------------------
   * TABLE ROWS
   * --------------------------------------------------------------------------
   */

  let currentY =
    startY +
    headerHeight;

  rows.forEach(
    (row) => {
      pdf.setDrawColor(
        ...BLUE,
      );

      pdf.setLineWidth(
        0.35,
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
        "normal",
      );

      pdf.setFontSize(
        6.8,
      );

      const textY =
        currentY +
        4.6;

      /* ----------------------------------------------------------------------
       * NUMBER
       * ----------------------------------------------------------------------
       */

      if (row.no) {
        pdf.text(
          row.no,
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
       * AVAILABLE
       * ----------------------------------------------------------------------
       */

      if (
        row.available
      ) {
        pdf.text(
          row.available,
          xs[3] - 2,
          textY,
          {
            align:
              "right",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * ISSUED
       * ----------------------------------------------------------------------
       */

      if (
        row.issued
      ) {
        pdf.text(
          row.issued,
          xs[4] - 2,
          textY,
          {
            align:
              "right",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * BALANCE
       * ----------------------------------------------------------------------
       */

      if (
        row.balance
      ) {
        pdf.text(
          row.balance,
          xs[5] - 2,
          textY,
          {
            align:
              "right",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * UNIT
       * ----------------------------------------------------------------------
       */

      if (
        row.unit
      ) {
        pdf.text(
          row.unit,
          (
            xs[5] +
            xs[6]
          ) / 2,
          textY,
          {
            align:
              "center",
          },
        );
      }

      /* ----------------------------------------------------------------------
       * COMMENT
       * ----------------------------------------------------------------------
       */

      if (
        row.comment
      ) {
        const comment =
          pdf.splitTextToSize(
            row.comment,
            widths.comment -
              4,
          );

        pdf.text(
          comment.slice(
            0,
            1,
          ),
          xs[6] + 2,
          textY,
        );
      }

      currentY +=
        rowHeight;
    },
  );

  /**
   * Return actual table bottom.
   *
   * Used for compact positioning of notes/signatures.
   */
  return currentY;
}

/* ============================================================================
 * NOTES
 * ============================================================================
 */

/**
 * Draw notes compactly beneath the table.
 *
 * Returns the Y coordinate after notes.
 */
function drawNotes(
  pdf: any,
  notes: string | null | undefined,
  startY: number,
) {
  if (!notes) {
    return startY;
  }

  const y =
    startY + 5;

  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(
    7.2,
  );

  pdf.text(
    "NOTES:",
    PAGE.left,
    y,
  );

  const notesX =
    PAGE.left + 15;

  const notesWidth =
    CONTENT_WIDTH - 15;

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    7,
  );

  const lines =
    pdf.splitTextToSize(
      notes,
      notesWidth,
    );

  /**
   * Keep issue form compact.
   */
  const visibleLines =
    lines.slice(
      0,
      2,
    );

  pdf.text(
    visibleLines,
    notesX,
    y,
    {
      lineHeightFactor:
        1.15,
    },
  );

  return (
    y +
    Math.max(
      4,
      visibleLines.length *
        4,
    )
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
   * Remove underline directly beneath printed name.
   */
  pdf.setFillColor(
    ...WHITE,
  );

  pdf.rect(
    lineStart +
      1,
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
   * Digital signature appears above the line.
   */
  if (signature) {
    addContainedImage(
      pdf,
      signature,
      lineStart + 3,
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
 * HANDOVER SECTION
 * ============================================================================
 */

/**
 * The handover section now starts dynamically after the table,
 * instead of using large fixed Y positions.
 */
function drawHandoverSection(
  pdf: any,
  issue: IssuePdf,
  signature: any,
  contentEndY: number,
) {
  const leftX =
    PAGE.left;

  const rightX =
    109;

  const leftWidth =
    88;

  const rightWidth =
    93;

  /**
   * Start close to table/notes.
   */
  let nameY =
    contentEndY +
    9;

  /**
   * Prevent it from moving too high or too low.
   */
  nameY =
    Math.max(
      nameY,
      224,
    );

  nameY =
    Math.min(
      nameY,
      248,
    );

  const signatureY =
    nameY + 10;

  /* --------------------------------------------------------------------------
   * ISSUED BY
   * --------------------------------------------------------------------------
   */

  drawNameLine(
    pdf,
    {
      label:
        "Issued By",

      name:
        issue.issuedBy ||
        "",

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

      signature,
    },
  );

  /* --------------------------------------------------------------------------
   * COLLECTED BY
   * --------------------------------------------------------------------------
   */

  drawNameLine(
    pdf,
    {
      label:
        "Collected By",

      name:
        issue.collector
          ?.name ||
        "",

      x:
        rightX,

      y:
        nameY,

      width:
        rightWidth,
    },
  );

  /**
   * Collector signs manually.
   */
  drawSignatureLine(
    pdf,
    {
      x:
        rightX,

      y:
        signatureY,

      width:
        rightWidth,
    },
  );
}

/* ============================================================================
 * CONTINUATION PAGE INDICATOR
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
    TABLE_START_Y -
      10,
    {
      align:
        "right",
    },
  );
}

/* ============================================================================
 * FOOTER
 * ============================================================================
 */

function drawFooter(
  pdf: any,
  issue: IssuePdf,
  pageNumber: number,
  totalPages: number,
) {
  const footerY = 289;

  setBlue(pdf);

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    6.6,
  );

  pdf.text(
    `Issue ${issue.reference}`,
    PAGE.left,
    footerY,
  );

  pdf.text(
    `Page ${pageNumber} of ${totalPages}`,
    PAGE.width -
      PAGE.right,
    footerY,
    {
      align:
        "right",
    },
  );
}

/* ============================================================================
 * PAGE SPLITTING
 * ============================================================================
 */

function chunkItems(
  items:
    IssuePdf["items"],
) {
  const chunks:
    IssuePdf["items"][] =
    [];

  for (
    let index = 0;
    index <
    items.length;
    index +=
      TABLE_ROWS_PER_PAGE
  ) {
    chunks.push(
      items.slice(
        index,
        index +
          TABLE_ROWS_PER_PAGE,
      ),
    );
  }

  /**
   * Allow issue note with no items.
   */
  if (
    chunks.length ===
    0
  ) {
    chunks.push(
      [],
    );
  }

  return chunks;
}

/* ============================================================================
 * BUILD PDF
 * ============================================================================
 */

async function buildWorkshopIssuePdf(
  issue: IssuePdf,
  company?: Company,
) {
  const pdf =
    createCorporatePdf(
      "portrait",
    );

  /* --------------------------------------------------------------------------
   * LOGO
   * --------------------------------------------------------------------------
   */

  const logo =
    await loadIssueLogo();

  /* --------------------------------------------------------------------------
   * ISSUER SIGNATURE
   * --------------------------------------------------------------------------
   */

  const signature =
    await loadSignatureImage(
      issue.issuedBySignatureUrl,
    );

  /* --------------------------------------------------------------------------
   * ITEM PAGES
   * --------------------------------------------------------------------------
   */

  const pages =
    chunkItems(
      issue.items ||
        [],
    );

  let itemOffset =
    0;

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
       * COMPANY HEADER
       * ----------------------------------------------------------------------
       */

      drawHeader(
        pdf,
        company,
        logo,
      );

      /* ----------------------------------------------------------------------
       * DOCUMENT TITLE
       * ----------------------------------------------------------------------
       */

      drawTitle(
        pdf,
        company,
      );

      /* ----------------------------------------------------------------------
       * ISSUE DETAILS
       * ----------------------------------------------------------------------
       */

      drawIssueDetails(
        pdf,
        issue,
      );

      /* ----------------------------------------------------------------------
       * CONTINUATION INDICATOR
       * ----------------------------------------------------------------------
       */

      if (
        pageIndex >
        0
      ) {
        drawContinuationLabel(
          pdf,
          pageIndex +
            1,
        );
      }

      /* ----------------------------------------------------------------------
       * TABLE
       * ----------------------------------------------------------------------
       */

      const rows =
        buildRows(
          pageItems,
          itemOffset,
        );

      const tableEndY =
        drawIssueTable(
          pdf,
          rows,
        );

      itemOffset +=
        pageItems.length;

      /* ----------------------------------------------------------------------
       * NOTES + HANDOVER
       *
       * Final page only.
       * ----------------------------------------------------------------------
       */

      if (
        finalPage
      ) {
        const contentEndY =
          drawNotes(
            pdf,
            issue.notes,
            tableEndY,
          );

        drawHandoverSection(
          pdf,
          issue,
          signature,
          contentEndY,
        );
      }

      /* ----------------------------------------------------------------------
       * FOOTER
       * ----------------------------------------------------------------------
       */

      drawFooter(
        pdf,
        issue,
        pageIndex +
          1,
        pages.length,
      );
    },
  );

  return {
    blob:
      pdf.output(
        "blob",
      ),

    filename:
      `${safePdfFilename(
        issue.reference ||
          "workshop-issue",
      )}.pdf`,
  };
}

/* ============================================================================
 * GENERATE PDF
 * ============================================================================
 */

export async function generateWorkshopIssuePdf(
  issue: IssuePdf,
  company?: Company,
): Promise<Blob> {
  return (
    await buildWorkshopIssuePdf(
      issue,
      company,
    )
  ).blob;
}

/* ============================================================================
 * DOWNLOAD PDF
 * ============================================================================
 */

export async function downloadWorkshopIssuePdf(
  issue: IssuePdf,
  company?: Company,
): Promise<void> {
  const {
    blob,
    filename,
  } =
    await buildWorkshopIssuePdf(
      issue,
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
