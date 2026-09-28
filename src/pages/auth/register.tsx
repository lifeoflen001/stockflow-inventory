import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { AuthField, AuthForm, AuthHeading, AuthMessage, AuthPasswordField, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirmation: "", terms: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await apiClient.post<{ data?: { deliveryWarning?: string | null } }>("/auth/register", { ...form, email: form.email.trim().toLowerCase() });
      navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`, { replace: true, state: { deliveryWarning: response.data.data?.deliveryWarning ?? undefined } });
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Unable to create account"));
    } finally {
      setBusy(false);
    }
  };

  return <AuthShell><AuthHeading title="Create account" subtitle="Set up your StockFlow workspace." /><AuthForm onSubmit={submit}><AuthMessage>{error}</AuthMessage><AuthField id="name" label="Full name" value={form.name} autoComplete="name" placeholder="Your full name" onChange={(event) => setForm({ ...form, name: event.target.value })} /><AuthField id="email" label="Email address" type="email" value={form.email} autoComplete="email" placeholder="you@example.com" inputMode="email" onChange={(event) => setForm({ ...form, email: event.target.value })} /><AuthPasswordField id="password" label="Password" value={form.password} placeholder="At least 10 characters" onChange={(event) => setForm({ ...form, password: event.target.value })} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} /><AuthPasswordField id="password-confirmation" label="Confirm password" value={form.password_confirmation} placeholder="Repeat your password" onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} /><label className="flex items-center gap-2 text-xs text-muted-foreground"><input className="size-3.5 accent-primary" type="checkbox" required checked={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.checked })} />I agree to the Terms and Conditions</label><AuthSubmit busy={busy} disabled={!form.terms} busyLabel="Creating account...">Create account</AuthSubmit><p className="pt-3 text-center text-xs text-muted-foreground">Already have an account? <Link className="font-semibold text-primary hover:underline" to="/">Sign in</Link></p></AuthForm></AuthShell>;
}
