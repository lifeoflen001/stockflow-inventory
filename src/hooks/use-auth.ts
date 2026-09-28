import { useContext } from "react";
import { AuthContext } from "@/components/providers/auth.tsx";

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export const useUser = () => useAuth().user;
