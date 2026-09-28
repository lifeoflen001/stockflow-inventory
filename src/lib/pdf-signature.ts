type PdfImageDocument = {
  addImage: (
    imageData: string,
    format: "PNG",
    x: number,
    y: number,
    width: number,
    height: number,
    alias?: string,
    compression?: "NONE" | "FAST" | "MEDIUM" | "SLOW",
  ) => void;
  getImageProperties?: (imageData: string) => { width?: number; height?: number };
};

export type SignatureImage = string;

export async function loadSignatureImage(signatureUrl?: string | null): Promise<string | undefined> {
  if (!signatureUrl) return undefined;

  try {
    const response = await fetch(signatureUrl);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function addSignatureImage(
  pdf: PdfImageDocument,
  imageData: string | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (!imageData) return;

  try {
    const properties = pdf.getImageProperties?.(imageData);
    const ratio = properties?.width && properties.height ? properties.width / properties.height : maxWidth / maxHeight;
    const width = Math.min(maxWidth, maxHeight * ratio);
    const height = Math.min(maxHeight, maxWidth / ratio);
    pdf.addImage(imageData, "PNG", x, y + (maxHeight - height) / 2, width, height, undefined, "FAST");
  } catch {
    // A missing or malformed signature should not prevent the PDF download.
  }
}
