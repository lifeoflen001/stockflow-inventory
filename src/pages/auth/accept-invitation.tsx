import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints.ts";
import { getApiErrorMessage } from "@/api/client.ts";
import { useApiMutation } from "@/hooks/use-api.ts";
import { AuthField, AuthForm, AuthHeading, AuthMessage, AuthPasswordField, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const acceptInvitation = useApiMutation(endpoints.administration.acceptInvitation);
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(token ? null : "This invitation link is invalid.");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const result = await acceptInvitation({ token, name: name.trim(), password, password_confirmation: passwordConfirmation }) as { data?: { email?: string } };
      navigate(`/verify-email?email=${encodeURIComponent(result.data?.email ?? "")}`, { replace: true });
    } catch (cause) {
      setMessage(getApiErrorMessage(cause, "Unable to accept this invitation."));
    } finally {
      setSubmitting(false);
    }
  };

  return <AuthShell><AuthHeading title="Accept invitation" subtitle="Create your account to join the organization." /><AuthForm onSubmit={submit}><AuthMessage>{message}</AuthMessage><AuthField id="name" label="Full name" value={name} autoComplete="name" autoFocus onChange={(event) => setName(event.target.value)} /><AuthPasswordField id="password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} /><AuthPasswordField id="password-confirmation" label="Confirm password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} /><AuthSubmit busy={submitting} disabled={!token} busyLabel="Creating account...">Create account</AuthSubmit><p className="pt-3 text-center text-xs text-muted-foreground">Already registered? <Link className="font-semibold text-primary hover:underline" to="/">Sign in</Link></p></AuthForm></AuthShell>;
}
