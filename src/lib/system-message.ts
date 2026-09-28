export type SystemMessageType = "success" | "error" | "warning" | "info" | "loading";

export type SystemMessage = {
  id: number;
  type: SystemMessageType;
  message: string;
  duration?: number;
};

export const SYSTEM_MESSAGE_EVENT = "stockflow:system-message";

function publish(type: SystemMessageType, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SystemMessage>(SYSTEM_MESSAGE_EVENT, {
    detail: { id: Date.now() + Math.random(), type, message },
  }));
}

/** System feedback for authenticated application interactions. Auth screens keep using Sonner. */
export const toast = {
  success: (message: string) => publish("success", message),
  error: (message: string) => publish("error", message),
  warning: (message: string) => publish("warning", message),
  info: (message: string) => publish("info", message),
  loading: (message = "Processing request...") => publish("loading", message),
  dismiss: () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<SystemMessage | null>(SYSTEM_MESSAGE_EVENT, { detail: null }));
  },
};
