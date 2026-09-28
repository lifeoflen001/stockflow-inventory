import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { AuthUser } from "@/components/providers/auth.tsx";
import { cn } from "@/lib/utils.ts";

type LockScreenProps = {
  user: AuthUser;
  unlock: (password: string) => Promise<void>;
  signout: () => Promise<void>;
  onUnlocked: () => void;
};

export function LockScreen({ user, unlock, signout, onUnlocked }: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = user.profile.name?.trim() || "User";
  const email = user.profile.email?.trim();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlock(password);
      sessionStorage.removeItem("stockflow_screen_locked");
      onUnlocked();
    } catch (cause) {
      setPassword("");
      setError(cause instanceof Error ? cause.message : "Incorrect password. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const signOut = () => {
    sessionStorage.removeItem("stockflow_screen_locked");
    void signout();
  };

  return <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-background px-4 py-8 text-foreground">
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_15%_12%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_32%),radial-gradient(circle_at_88%_80%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_34%)]">
      <div className="absolute -left-10 top-16 size-48 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute right-10 top-8 size-64 rounded-full bg-primary/10 blur-3xl" />
    </div>
    <Button type="button" variant="outline" size="icon" className="absolute right-5 top-5 z-10" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl shadow-black/15 backdrop-blur">
      <div className="border-b border-border/70 bg-muted/20 px-7 pb-8 pt-9 text-center sm:px-10">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5"><LockKeyhole className="size-7" /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Inventory secure workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Screen locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your password to continue working.</p>

        <Avatar className="mx-auto mt-7 size-20 border-4 border-background shadow-lg ring-1 ring-border">
          <AvatarImage src={user.profile.avatarUrl ?? undefined} alt="" />
          <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <p className="mt-4 font-semibold">{name}</p>
        {email && <p className="mt-1 truncate text-xs text-muted-foreground">{email}</p>}

        <form onSubmit={handleUnlock} className="mt-7 space-y-4 text-left">
          <div>
            <label htmlFor="screen-lock-password" className="mb-1.5 block text-sm font-medium">Password</label>
            <div className="relative">
              <input
                id="screen-lock-password"
                autoFocus
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(""); }}
                placeholder="Enter your password"
                autoComplete="current-password"
                className={cn("h-11 w-full rounded-lg border bg-background px-3 pr-11 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15", error && "border-destructive focus:border-destructive focus:ring-destructive/15")}
              />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
          </div>
          <Button type="submit" disabled={busy || !password} className="h-11 w-full">
            {busy ? <><Loader2 className="size-4 animate-spin" />Unlocking…</> : <><LockKeyhole className="size-4" />Unlock workspace</>}
          </Button>
        </form>
      </div>
      <div className="flex items-center justify-center border-t border-border/70 bg-muted/30 px-6 py-4">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={signOut} className="text-muted-foreground hover:text-foreground"><LogOut className="size-4" />Sign out instead</Button>
      </div>
    </div>
  </div>;
}
