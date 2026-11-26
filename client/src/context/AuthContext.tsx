import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest, getStoredToken, setStoredToken } from "@/lib/api";

export interface AuthUser {
  id: number;
  username: string;
  role: "super_admin" | "team_manager" | "player";
  displayName: string;
  teamId?: number | null;
  playerId?: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string, expectedRole?: "super_admin" | "team_manager" | "player") => Promise<AuthUser>;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = getStoredToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: AuthUser }>("/api/auth/me");
      setUser(data.user);
      setToken(t);
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const setSession = useCallback((newToken: string, newUser: AuthUser) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(
    async (username: string, password: string, expectedRole?: "super_admin" | "team_manager" | "player") => {
      const data = await apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, expectedRole }),
      });
      setSession(data.token, data.user);
      return data.user;
    },
    [setSession]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, setSession, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
