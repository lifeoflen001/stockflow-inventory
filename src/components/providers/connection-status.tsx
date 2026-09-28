import { useEffect } from "react";
import { toast } from "sonner";

export function ConnectionStatus() {
  useEffect(() => {
    const handleOffline = () => {
      toast.error("No internet connection", {
        description: "Changes may not save until your connection is restored.",
        duration: 6000,
      });
    };
    const handleOnline = () => {
      toast.success("Internet connection restored", {
        description: "You can continue working normally.",
      });
    };

    if (!navigator.onLine) handleOffline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}
