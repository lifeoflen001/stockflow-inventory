import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { AuthCodeInput, AuthForm, AuthHeading, AuthMessage, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const email = params.get("email") ?? "";
  const deliveryWarning = (location.state as { deliveryWarning?: string } | null)?.deliveryWarning;
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(deliveryWarning);
  const code = digits.join("");
  const update = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };
  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post("/auth/verify-email", { email, code });
      toast.success("Email verified. You can now sign in.");
      navigate("/", { replace: true });
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    try {
      await apiClient.post("/auth/resend-code", { email });
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
      toast.success("A new verification code has been sent.");
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };
  return <AuthShell><AuthHeading title="Verify email" subtitle={`Enter the six-digit code sent to ${email || "your email"}.`} /><AuthForm onSubmit={verify}><AuthMessage>{error}</AuthMessage><div className="flex justify-center gap-2">{digits.map((digit, index) => <AuthCodeInput key={index} id={String(index + 1)} value={digit} inputRef={(element) => { refs.current[index] = element; }} onChange={(event) => update(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index > 0) refs.current[index - 1]?.focus(); }} />)}</div><p className="text-center text-xs text-muted-foreground">The code expires in 10 minutes.</p><AuthSubmit busy={busy} disabled={code.length !== 6} busyLabel="Verifying code...">Verify email</AuthSubmit><p className="pt-3 text-center text-xs text-muted-foreground">Didn&apos;t receive the code? <button className="font-semibold text-primary hover:underline" type="button" onClick={resend}>Resend code</button><br /><Link className="font-semibold text-primary hover:underline" to="/">Back to sign in</Link></p></AuthForm></AuthShell>;
}
