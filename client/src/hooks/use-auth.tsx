import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, setBearerToken } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  status: "bootstrapping" | "authenticated" | "anonymous";
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, displayName?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("bootstrapping");

  const refresh = async (): Promise<AuthUser | null> => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = (await res.json()) as { user: AuthUser | null };
      setUser(data.user);
      setStatus(data.user ? "authenticated" : "anonymous");
      return data.user;
    } catch {
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login: AuthState["login"] = async (email, password) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  };

  const signup: AuthState["signup"] = async (email, password, displayName) => {
    const res = await apiRequest("POST", "/api/auth/signup", { email, password, displayName });
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  };

  const logout: AuthState["logout"] = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } finally {
      setBearerToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  };

  return (
    <AuthContext.Provider value={{ user, status, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
