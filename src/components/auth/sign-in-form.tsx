import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "@/api/client.ts";
import { AuthField, AuthForm, AuthHeading, AuthMessage, AuthPasswordField, AuthSecondaryButton, AuthSubmit } from "@/components/auth/auth-form.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";
import { useAuth } from "@/hooks/use-auth.ts";

export function SignInForm() {
  const { signin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem("stockflow_remember_email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(Boolean(email));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(undefined);
    setSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await signin({ email: normalizedEmail, password });
      if (remember) localStorage.setItem("stockflow_remember_email", normalizedEmail);
      else localStorage.removeItem("stockflow_remember_email");
    } catch (cause) {
      const error = getApiErrorMessage(cause, "Unable to sign in");
      setMessage(error);
      if (error.toLowerCase().includes("verif")) navigate(`/verify-email?email=${encodeURIComponent(normalizedEmail)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return <AuthShell><AuthHeading title="Sign in" subtitle="Enter your details to access your account." /><AuthForm onSubmit={submit}><AuthMessage>{message}</AuthMessage><AuthField id="email" label="User Name" type="email" value={email} autoComplete="username" inputMode="email" onChange={(event) => setEmail(event.target.value)} /><AuthPasswordField id="password" label="Password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} /><div className="auth-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label><Link to="/forgot-password">Forgot Password?</Link></div><AuthSubmit busy={submitting} busyLabel="Signing in...">Sign in</AuthSubmit><div className="auth-divider"><span />Or<span /></div><AuthSecondaryButton>Continue with Google</AuthSecondaryButton><p className="auth-form-footer">Don&apos;t have an account? <Link to="/register">Sign Up</Link></p></AuthForm></AuthShell>;
}
