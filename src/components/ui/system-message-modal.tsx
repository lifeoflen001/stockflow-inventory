import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { SYSTEM_MESSAGE_EVENT, type SystemMessage, type SystemMessageType } from "@/lib/system-message.ts";

const messageMeta: Record<SystemMessageType, { title: string; icon: LucideIcon; iconClass: string; iconBackground: string }> = {
  success: { title: "Completed", icon: CheckCircle2, iconClass: "text-emerald-600", iconBackground: "bg-emerald-500/10" },
  error: { title: "Something went wrong", icon: XCircle, iconClass: "text-destructive", iconBackground: "bg-destructive/10" },
  warning: { title: "Please check this", icon: AlertTriangle, iconClass: "text-amber-600", iconBackground: "bg-amber-500/10" },
  info: { title: "System message", icon: Info, iconClass: "text-primary", iconBackground: "bg-primary/10" },
  loading: { title: "Working...", icon: Loader2, iconClass: "text-primary animate-spin", iconBackground: "bg-primary/10" },
};

export function SystemMessageModal() {
  const [message, setMessage] = useState<SystemMessage | null>(null);

  useEffect(() => {
    const receive = (event: Event) => setMessage((event as CustomEvent<SystemMessage | null>).detail);
    window.addEventListener(SYSTEM_MESSAGE_EVENT, receive);
    return () => window.removeEventListener(SYSTEM_MESSAGE_EVENT, receive);
  }, []);

  useEffect(() => {
    if (!message || message.type === "loading") return;
    const timer = window.setTimeout(() => setMessage(null), message.duration ?? 4600);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  const meta = messageMeta[message.type];
  const Icon = meta.icon;
  const close = () => setMessage(null);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-[2px] animate-in fade-in-0 duration-200" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section aria-label={meta.title} aria-modal="true" role="alertdialog" className="relative w-full max-w-md rounded-xl border bg-card px-6 py-7 text-center text-card-foreground shadow-2xl outline-none animate-in fade-in-0 zoom-in-95 duration-300">
        <button type="button" aria-label="Close message" onClick={close} className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        <div className={cn("mx-auto flex size-16 items-center justify-center rounded-full", meta.iconBackground)}><Icon className={cn("size-9", meta.iconClass, message.type === "success" && "animate-in zoom-in-75 duration-300")} strokeWidth={1.7} /></div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight">{meta.title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message.message}</p>
        {message.type !== "loading" && <button type="button" onClick={close} className="mt-6 inline-flex min-w-24 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Close</button>}
      </section>
    </div>,
    document.body,
  );
}
