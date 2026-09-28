import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { toast } from "@/lib/system-message.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

export type DocumentViewerDocument = {
  name: string;
  mimeType: string;
  downloadPath: string;
  previewUrl?: string;
};

function PdfPage({ pdf, pageNumber, width, rotation }: { pdf: any; pageNumber: number; width: number; rotation: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas || !width) return () => undefined;

    void pdf.getPage(pageNumber).then((page: any) => {
      if (!active || !canvas) return;

      const baseViewport = page.getViewport({ scale: 1, rotation });
      const scale = Math.min(width / baseViewport.width, 2);
      const viewport = page.getViewport({ scale, rotation });
      const outputScale = window.devicePixelRatio || 1;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      // PDF.js applies the page viewport transform itself. Only provide the
      // device-pixel-ratio transform here; adding another Y-axis transform
      // would rotate the whole page in the canvas.
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number] : undefined;
      return page.render({ canvasContext: context, viewport, transform }).promise;
    });

    return () => {
      active = false;
    };
  }, [pageNumber, pdf, rotation, width]);

  return <canvas ref={canvasRef} className="block max-w-full" aria-label={`Page ${pageNumber}`} />;
}

function PdfPreview({ source, name }: { source: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return () => undefined;

    const updateWidth = () => setContentWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loadingTask: any;
    let loadedPdf: any;
    setPdf(null);
    setRotation(0);
    setError(null);

    void import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
        loadingTask = pdfjs.getDocument({ url: source });
        return loadingTask.promise.then(async (loaded: any) => {
          // Older system PDFs were saved as one full-page image, with the
          // image pixels inverted. Correct only that known legacy format in
          // preview; ordinary uploaded PDFs and the original download stay
          // untouched.
          const isSystemDocument = /^(?:PO|PC|PCV|PETTY|VOUCHER|WIS|WORKSHOP|ISSUE)[-_\s]/i.test(name);
          if (isSystemDocument && loaded.numPages > 0) {
            try {
              const firstPage = await loaded.getPage(1);
              const operators = await firstPage.getOperatorList();
              const allowedOperators = new Set([
                pdfjs.OPS.dependency,
                pdfjs.OPS.save,
                pdfjs.OPS.restore,
                pdfjs.OPS.transform,
                pdfjs.OPS.paintImageXObject,
                pdfjs.OPS.paintImageMaskXObject,
                pdfjs.OPS.beginMarkedContent,
                pdfjs.OPS.endMarkedContent,
              ]);
              const hasFullPageImage = operators.fnArray.includes(pdfjs.OPS.paintImageXObject)
                && operators.fnArray.every((operator: number) => allowedOperators.has(operator));
              if (hasFullPageImage) setRotation(180);
            } catch {
              // Rendering remains available if operator inspection is not
              // supported by a particular PDF or browser worker.
            }
          }
          return loaded;
        });
      })
      .then((loaded: any) => {
        loadedPdf = loaded;
        if (active) setPdf(loaded);
        else void loaded.destroy();
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to render this PDF");
      });

    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy();
      if (loadedPdf) void loadedPdf.destroy();
    };
  }, [name, source]);

  return <div ref={containerRef} className="flex min-h-[70vh] items-start justify-center overflow-auto rounded-lg border bg-slate-100 p-4 sm:p-6">
    {error ? <div className="flex min-h-[60vh] items-center justify-center text-sm text-destructive">{error}</div> : !pdf ? <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Preparing PDF preview…</div> : <div className="flex w-full max-w-[1100px] flex-col items-center gap-6">
      {Array.from({ length: pdf.numPages }, (_, index) => <div key={`${name}-${index + 1}`} className="w-full overflow-hidden bg-white shadow-md ring-1 ring-slate-200"><PdfPage pdf={pdf} pageNumber={index + 1} width={Math.max(contentWidth - 48, 280)} rotation={rotation} /></div>)}
    </div>}
  </div>;
}

export function DocumentViewer({ document, onOpenChange }: { document: DocumentViewerDocument | null; onOpenChange: (document: DocumentViewerDocument | null) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setError(null);
    if (!document) return () => undefined;
    if (document.previewUrl) {
      setPreviewUrl(document.previewUrl);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    void apiClient.get(document.downloadPath, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: document.mimeType });
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause, "Unable to open this document"));
      })
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document]);

  const download = () => {
    if (!previewUrl || !document) return;
    const link = window.document.createElement("a");
    link.href = previewUrl;
    link.download = document.name;
    link.click();
  };

  const print = () => {
    if (!previewUrl) return;
    const printWindow = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.error("Allow pop-ups to print this document");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
    }, { once: true });
  };

  const previewable = Boolean(document && (document.mimeType.startsWith("image/") || document.mimeType === "application/pdf" || document.mimeType.startsWith("text/")));

  return <Dialog open={Boolean(document)} onOpenChange={(open) => { if (!open) onOpenChange(null); }}>
    <DialogContent style={{ width: "98vw", maxWidth: "1600px", height: "94vh", maxHeight: "94vh" }} className="flex flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-2xl">
      <DialogHeader className="flex-row items-center justify-between gap-3 border-b bg-background px-5 py-3.5 pr-14">
        <DialogTitle className="flex min-w-0 items-center gap-2 truncate text-sm"><FileText className="size-4 shrink-0 text-primary" /><span className="truncate">{document?.name ?? "Document"}</span></DialogTitle>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" title="Print document" aria-label="Print document" disabled={!previewUrl || !previewable} onClick={print}><Printer className="size-4" /></Button>
          <Button variant="ghost" size="icon" title="Download document" aria-label="Download document" disabled={!previewUrl} onClick={download}><Download className="size-4" /></Button>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-background p-2 sm:p-3">
        {loading && <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Opening document…</div>}
        {!loading && error && <div className="flex min-h-[70vh] items-center justify-center text-sm text-destructive">{error}</div>}
        {!loading && !error && previewUrl && previewable && document?.mimeType.startsWith("image/") && <div className="flex min-h-[70vh] items-center justify-center rounded-lg border bg-background p-3 shadow-sm"><img src={previewUrl} alt={document.name} className="max-h-[80vh] max-w-full object-contain" /></div>}
        {!loading && !error && previewUrl && previewable && document?.mimeType === "application/pdf" && <PdfPreview source={previewUrl} name={document.name} />}
        {!loading && !error && previewUrl && previewable && !document?.mimeType.startsWith("image/") && document?.mimeType !== "application/pdf" && <iframe title={document?.name ?? "Document preview"} src={previewUrl} className="h-[80vh] min-h-[560px] w-full rounded-lg border bg-background shadow-sm" />}
        {!loading && !error && previewUrl && !previewable && <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-lg border bg-background text-center shadow-sm"><FileText className="size-12 text-muted-foreground/50" /><p className="mt-3 font-medium">Preview is not available for this file type.</p><p className="mt-1 text-sm text-muted-foreground">Use the download icon to open it with the appropriate application.</p></div>}
      </div>
    </DialogContent>
  </Dialog>;
}
