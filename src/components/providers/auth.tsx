import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client.ts";
import { clearApiQueryCache } from "@/hooks/use-api.ts";
import type { OperationalRole } from "@/types/operations.ts";
import { toast as sonnerToast } from "sonner";

export interface AuthUser {
  id: string;
  /** The backend supports both system roles and custom roles created by administrators. */
  role: string;
  profile: { name?: string; email?: string; phone?: string; avatarUrl?: string | null; signatureUrl?: string | null };
  organization?: { id: string; name: string; currency?: string | null } | null;
  permissions: string[];
  department?: { id: string; name: string; code: string } | null;
  supplier?: { id: string; name: string } | null;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  signin: (credentials?: SignInCredentials) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  signout: () => Promise<void>;
  switchRole: (role: OperationalRole) => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === "true") {
      const localUser = sessionStorage.getItem("stockflow_dev_user");
      if (localUser) setUser(JSON.parse(localUser) as AuthUser);
      setIsLoading(false);
      return;
    }
    if (!localStorage.getItem("auth_token")) { setIsLoading(false); return; }
    apiClient.get<AuthUser>("/auth/me")
      .then(({ data }) => setUser(data))
      .catch((cause: unknown) => {
        localStorage.removeItem("auth_token");
        setError(cause instanceof Error ? cause : new Error("Authentication failed"));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await apiClient.get<AuthUser>("/auth/me");
    setUser(data);
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === "true")) return;
    const lastRefreshAt = { current: 0 };
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefreshAt.current < 60_000) return;
      lastRefreshAt.current = Date.now();
      void refreshUser().catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [refreshUser, userId]);

  useEffect(() => {
    const clearExpiredSession = () => {
      sessionStorage.removeItem("stockflow_screen_locked");
      sessionStorage.removeItem("stockflow_lock_return_path");
      Object.keys(sessionStorage).filter((key) => key.startsWith("stockflow:draft:")).forEach((key) => sessionStorage.removeItem(key));
      clearApiQueryCache();
      setUser(null);
    };
    window.addEventListener("stockflow:unauthorized", clearExpiredSession);
    return () => window.removeEventListener("stockflow:unauthorized", clearExpiredSession);
  }, []);

  const signin = useCallback(async (credentials?: SignInCredentials) => {
    if (credentials && import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === "true") {
      const expectedEmail = import.meta.env.VITE_DEV_SUPERUSER_EMAIL as string | undefined;
      const expectedPassword = import.meta.env.VITE_DEV_SUPERUSER_PASSWORD as string | undefined;
      if (credentials.email !== expectedEmail || credentials.password !== expectedPassword) {
        throw new Error("Invalid email or password");
      }
      const devUser: AuthUser = {
        id: "dev-superuser",
        role: "super_admin",
        profile: { name: "System Administrator", email: expectedEmail },
        permissions: ["data.export", "data.import"],
      };
      sessionStorage.setItem("stockflow_dev_user", JSON.stringify(devUser));
      clearApiQueryCache();
      setError(null);
      setUser(devUser);
      sonnerToast.success("Login successful", { description: "Welcome back to the workspace." });
      return;
    }
    if (credentials) {
      const { data } = await apiClient.post<{ token?: string; user: AuthUser }>("/auth/login", credentials);
      if (data.token) localStorage.setItem("auth_token", data.token);
      clearApiQueryCache();
      setError(null);
      setUser(data.user);
      sonnerToast.success("Login successful", { description: "Welcome back to the workspace." });
      return;
    }
    const loginUrl = import.meta.env.VITE_AUTH_LOGIN_URL as string | undefined;
    if (!loginUrl) throw new Error("VITE_AUTH_LOGIN_URL is not configured");
    window.location.assign(loginUrl);
  }, []);

  const unlock = useCallback(async (password: string) => {
    const { data } = await apiClient.post<{ user: AuthUser }>("/auth/unlock", { password });
    setError(null);
    setUser(data.user);
  }, []);

  const signout = useCallback(async () => {
    try { await apiClient.post("/auth/logout"); } catch { /* local logout still succeeds */ }
    clearApiQueryCache();
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("stockflow_dev_user");
    sessionStorage.removeItem("stockflow_screen_locked");
    sessionStorage.removeItem("stockflow_lock_return_path");
    Object.keys(sessionStorage).filter((key) => key.startsWith("stockflow:draft:")).forEach((key) => sessionStorage.removeItem(key));
    setUser(null);
    sonnerToast.success("Logged out successfully");
  }, []);

  const switchRole = useCallback((role: OperationalRole) => {
    if (!import.meta.env.DEV || !user) return;
    const nextUser = { ...user, role };
    sessionStorage.setItem("stockflow_dev_user", JSON.stringify(nextUser));
    setUser(nextUser);
  }, [user]);

  const value = useMemo(() => ({ user, isAuthenticated: Boolean(user), isLoading, error, signin, unlock, signout, switchRole, refreshUser }), [user, isLoading, error, signin, unlock, signout, switchRole, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
