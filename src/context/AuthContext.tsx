/**
 * AuthContext.tsx
 *
 * Global auth state. Provides:
 *  - current user (loaded from GET /api/auth/me on mount)
 *  - login / logout helpers
 *  - isAdmin check
 *  - loading state while resolving session
 */

import {
  createContext, useContext, useState,
  useEffect, useCallback, type ReactNode,
} from "react";
import type { AuthUser } from "@/types/project";
import { getToken, getRefreshToken, authRefresh, authLogout as apiLogout, clearTokens } from "@/services/api";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:        AuthUser | null;
  loading:     boolean;
  isAdmin:     boolean;
  isLoggedIn:  boolean;
  setUser:     (u: AuthUser | null) => void;
  logout:      () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── Context ───────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Fetch full profile from /api/auth/me */
  const fetchMe = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      // Try refreshing if we have a refresh token
      if (getRefreshToken()) {
        const ok = await authRefresh();
        if (!ok) { setLoading(false); return; }
      } else {
        setLoading(false);
        return;
      }
    }

    try {
      const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5000";
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setUser(json.data as AuthUser);
      } else if (res.status === 401) {
        // Access token expired — try refresh
        const ok = await authRefresh();
        if (ok) {
          const res2 = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (res2.ok) {
            const j2 = await res2.json();
            if (j2.success) setUser(j2.data as AuthUser);
          }
        } else {
          clearTokens();
        }
      }
    } catch {
      // Network error — user stays null, app still works offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => { await fetchMe(); }, [fetchMe]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAdmin:    user?.role === "ADMIN",
      isLoggedIn: user !== null,
      setUser,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
