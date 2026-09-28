import { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { AuthField, AuthForm, AuthHeading, AuthMessage, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await apiClient.post<{ data: { message: string } }>("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setMessage(response.data.data.message);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return <AuthShell><AuthHeading title="Reset access" subtitle="We&apos;ll send a secure reset link to your email." /><AuthForm onSubmit={submit}><AuthMessage>{error}</AuthMessage><AuthMessage variant="success">{message}</AuthMessage><AuthField id="reset-email" label="Email address" type="email" value={email} autoComplete="email" placeholder="you@example.com" inputMode="email" onChange={(event) => setEmail(event.target.value)} /><AuthSubmit busy={busy} disabled={Boolean(message)} busyLabel="Sending link...">Send reset link</AuthSubmit><p className="pt-3 text-center text-xs text-muted-foreground"><Link className="font-semibold text-primary hover:underline" to="/">Back to sign in</Link></p></AuthForm></AuthShell>;
}
