import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const completeLogin = useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (!token) throw new Error("The authentication callback did not include a token.");
      localStorage.setItem("auth_token", token);
      await apiClient.post("/auth/sync");
      toast.success("Login successful", { description: "Welcome back to StockFlow." });
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    }
  }, [navigate]);
  useEffect(() => { void completeLogin(); }, [completeLogin]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-svh gap-6 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-destructive font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/", { replace: true })}>
            Return home
          </Button>
          <Button onClick={() => { setError(null); void completeLogin(); }}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-svh gap-4">
      <Spinner className="size-8" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
