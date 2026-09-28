import type { ChangeEvent, FormEventHandler, KeyboardEvent, ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function AuthForm({ children, onSubmit }: { children: ReactNode; onSubmit: FormEventHandler<HTMLFormElement> }) {
  return <form className="stockflow-auth-fields" onSubmit={onSubmit}>{children}</form>;
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <><h1 className="stockflow-auth-title">{title}</h1><p className="stockflow-auth-subtitle">{subtitle}</p></>;
}

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  inputMode?: "email" | "numeric" | "text";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function AuthField({ id, label, type = "text", value, placeholder, autoComplete, required = true, minLength, inputMode, onChange, onFocus, onBlur }: FieldProps) {
  return <div className="stockflow-auth-field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label><div className="stockflow-auth-input-line"><input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} required={required} minLength={minLength} inputMode={inputMode} onChange={onChange} onFocus={onFocus} onBlur={onBlur} /></div></div>;
}

export function AuthPasswordField({ id, label, value, placeholder, autoComplete = "new-password", minLength = 10, onChange, onFocus, onBlur, onTyping, visible, onToggle }: Omit<FieldProps, "type" | "inputMode"> & { onTyping: () => void; visible: boolean; onToggle: () => void }) {
  return <div className="stockflow-auth-field"><label htmlFor={id}>{label} *</label><div className="stockflow-auth-input-line"><input id={id} type={visible ? "text" : "password"} value={value} placeholder={placeholder} autoComplete={autoComplete} required minLength={minLength} onChange={(event) => { onChange(event); onTyping(); }} onFocus={onFocus} onBlur={onBlur} /><button type="button" className="stockflow-auth-password-toggle" aria-label={visible ? "Hide password" : "Show password"} onClick={onToggle}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>;
}

export function AuthMessage({ children, variant = "error" }: { children?: ReactNode; variant?: "error" | "success" }) {
  if (!children) return null;
  return <div className={variant === "error" ? "stockflow-auth-error" : "stockflow-auth-success"} role={variant === "error" ? "alert" : "status"}>{children}</div>;
}

export function AuthSubmit({ children, busy, disabled, busyLabel = "Please wait..." }: { children: ReactNode; busy?: boolean; disabled?: boolean; busyLabel?: string }) {
  return <button className="stockflow-auth-submit" type="submit" disabled={busy || disabled}>{busy ? <><Loader2 className="size-4 animate-spin" />{busyLabel}</> : children}</button>;
}

export function AuthSecondaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button className="stockflow-auth-secondary" type="button" onClick={onClick}>{children}</button>;
}

export function AuthCodeInput({ id, value, onChange, onFocus, onBlur, inputRef, onKeyDown }: { id: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onFocus?: () => void; onBlur?: () => void; inputRef?: (element: HTMLInputElement | null) => void; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void }) {
  return <input ref={inputRef} id={id} className="stockflow-auth-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={1} value={value} onChange={onChange} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} aria-label={`Digit ${id}`} />;
}
