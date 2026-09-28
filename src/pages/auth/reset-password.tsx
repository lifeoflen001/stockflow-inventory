import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { AuthForm, AuthHeading, AuthMessage, AuthPasswordField, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const [form, setForm] = useState({ password: "", password_confirmation: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>(!email || !token ? "This password reset link is incomplete or invalid." : "");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiClient.post("/auth/reset-password", { email, token, ...form });
      navigate("/", { replace: true });
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return <AuthShell><AuthHeading title="Create password" subtitle={`Choose a strong password for ${email || "your account"}.`} /><AuthForm onSubmit={submit}><AuthMessage>{error}</AuthMessage><AuthPasswordField id="new-password" label="New password" value={form.password} placeholder="At least 10 characters" onChange={(event) => setForm({ ...form, password: event.target.value })} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} /><AuthPasswordField id="password-confirmation" label="Confirm new password" value={form.password_confirmation} placeholder="Repeat your password" onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} /><p className="text-xs text-muted-foreground">Use at least 10 characters containing letters and numbers.</p><AuthSubmit busy={busy} disabled={!email || !token} busyLabel="Resetting password...">Reset password</AuthSubmit><p className="pt-3 text-center text-xs text-muted-foreground"><Link className="font-semibold text-primary hover:underline" to="/">Back to sign in</Link></p></AuthForm></AuthShell>;
}
