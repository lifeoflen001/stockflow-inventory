import type { ChangeEvent, FormEventHandler, KeyboardEvent, ReactNode } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";

export function AuthForm({ children, onSubmit }: { children: ReactNode; onSubmit: FormEventHandler<HTMLFormElement> }) {
  return <form className="auth-form" onSubmit={onSubmit}>{children}</form>;
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="auth-heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  minLength?: number;
  inputMode?: "email" | "numeric" | "text";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

function fieldIcon(label: string, type: string) {
  const normalized = `${label} ${type}`.toLowerCase();
  if (normalized.includes("password")) return LockKeyhole;
  if (normalized.includes("email")) return Mail;
  return UserRound;
}

export function AuthField({
  id,
  label,
  type = "text",
  value,
  placeholder,
  autoComplete,
  autoFocus,
  required = true,
  minLength,
  inputMode,
  onChange,
  onFocus,
  onBlur
}: FieldProps) {
  const Icon = fieldIcon(label, type);

  return (
    <div className="auth-field">
      <Label htmlFor={id}>{label}</Label>
      <div className="auth-input-wrap">
        <Icon className="auth-input-icon" aria-hidden="true" />
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          inputMode={inputMode}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          className="auth-field-input"
        />
      </div>
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete = "new-password",
  minLength = 10,
  onChange,
  onFocus,
  onBlur,
  onTyping,
  visible,
  onToggle
}: Omit<FieldProps, "type" | "inputMode"> & { onTyping?: () => void; visible: boolean; onToggle: () => void }) {
  return (
    <div className="auth-field">
      <Label htmlFor={id}>{label}</Label>
      <div className="auth-input-wrap">
        <LockKeyhole className="auth-input-icon" aria-hidden="true" />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          onChange={(event) => {
            onChange(event);
            onTyping?.();
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          className="auth-field-input auth-password-input"
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={onToggle}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AuthMessage({ children, variant = "error" }: { children?: ReactNode; variant?: "error" | "success" }) {
  if (!children) return null;
  return (
    <Alert variant={variant === "error" ? "destructive" : "default"} className={cn("auth-message", variant === "success" && "auth-message-success")}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function AuthSubmit({ children, busy, disabled, busyLabel = "Please wait..." }: { children: ReactNode; busy?: boolean; disabled?: boolean; busyLabel?: string }) {
  return (
    <Button className="auth-submit" type="submit" disabled={busy || disabled}>
      {busy ? <><Loader2 className="size-4 animate-spin" />{busyLabel}</> : children}
    </Button>
  );
}

export function AuthSecondaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <Button className="auth-secondary-button" variant="outline" type="button" onClick={onClick}><span className="auth-google-mark" aria-hidden="true">G</span>{children}</Button>;
}

export function AuthCodeInput({ id, value, onChange, onFocus, onBlur, inputRef, onKeyDown }: { id: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onFocus?: () => void; onBlur?: () => void; inputRef?: (element: HTMLInputElement | null) => void; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void }) {
  return (
    <Input
      ref={inputRef}
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      aria-label={`Digit ${id}`}
      className="auth-code-input"
    />
  );
}
