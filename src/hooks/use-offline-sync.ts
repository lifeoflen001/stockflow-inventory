import { useEffect } from "react";
import { syncPendingOperations } from "@/lib/offline-sync.ts";

export function useOfflineSynchronization(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const synchronize = () => { if (navigator.onLine) void syncPendingOperations(); };
    synchronize();
    window.addEventListener("online", synchronize);
    return () => window.removeEventListener("online", synchronize);
  }, [enabled]);
}
