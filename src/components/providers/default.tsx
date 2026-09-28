import { AuthProvider } from "./auth.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { SystemMessageModal } from "../ui/system-message-modal.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { ConnectionStatus } from "./connection-status.tsx";

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider>
            <ThemeProvider>
              <Toaster />
              <ConnectionStatus />
              <SystemMessageModal />
              {children}
            </ThemeProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}
