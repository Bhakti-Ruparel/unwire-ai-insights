/**
 * AuthContext.tsx
 *
 * Global auth state. Provides:
 *  - current user (loaded from GET /api/auth/me on mount)
 *  - login / logout helpers
 *  - isAdmin check
 *  - loading state while resolving session
 *
 * Session persistence after backend restart:
 *  1. On mount, checks if access token exists in localStorage
 *  2. Calls /api/auth/me — if 401, apiFetch auto-refreshes via mutex
 *  3. If refresh succeeds → session restored silently
 *  4. If refresh fails → tokens cleared, user redirected to login
 */

import {
  createContext, useContext, useState,
  useEffect, useCallback, type ReactNode,
} from "react";
import type { AuthUser } from "@/types/project";
import {
  getToken, getRefreshToken, authRefresh,
  authLogout as apiLogout, clearTokens,
} from "@/services/api";

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

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (): Promise<void> => {
    // No tokens at all — skip immediately
    if (!getToken() && !getRefreshToken()) {
      setLoading(false);
      return;
    }

    // If no access token but have refresh token, try refresh first
    if (!getToken() && getRefreshToken()) {
      const ok = await authRefresh();
      if (!ok) { setLoading(false); return; }
    }

    try {
      // Call /api/auth/me with current access token
      let res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      // If 401, try one refresh then retry
      if (res.status === 401 && getRefreshToken()) {
        const ok = await authRefresh();
        if (ok) {
          res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
        } else {
          // Refresh failed — session is dead
          setUser(null);
          setLoading(false);
          return;
        }
      }

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setUser(json.data as AuthUser);
        }
      } else {
        // Non-401 failure (403, 500, etc.) — clear session
        clearTokens();
        setUser(null);
      }
    } catch {
      // Network error — don't clear tokens (might just be offline)
      // Keep user null but don't destroy session data
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
