import { useCallback, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
};

type PendingConfirmation = ConfirmationOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmation() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    setPending({ ...options, resolve });
  }), []);

  const settle = (confirmed: boolean) => {
    if (!pending) return;
    pending.resolve(confirmed);
    setPending(null);
  };

  const confirmationDialog = (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className={pending?.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}>
            {pending?.destructive ? <AlertTriangle /> : <ShieldCheck />}
          </AlertDialogMedia>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={pending?.destructive ? "destructive" : "default"}
            onClick={(event) => { event.preventDefault(); settle(true); }}
          >
            {pending?.confirmLabel ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmationDialog };
}
