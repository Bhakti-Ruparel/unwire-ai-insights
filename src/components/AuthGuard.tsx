/**
 * AuthGuard.tsx
 *
 * Wraps any route that requires authentication.
 * If user is not logged in → redirects to /login immediately.
 * Shows a loading screen while auth state is resolving.
 * Never renders protected UI before auth check completes.
 */

import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Shield } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, loading, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!isLoggedIn) {
      const returnTo = window.location.pathname + window.location.search;
      navigate({ to: "/login", search: { returnTo } });
      return;
    }

    if (requireAdmin && !isAdmin) {
      navigate({ to: "/servers", search: {} } as any);
    }
  }, [loading, isLoggedIn, isAdmin, requireAdmin]);

  // Auth is still resolving — show loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="h-12 w-12 rounded-2xl btn-primary-grad flex items-center justify-center">
          <Shield className="h-6 w-6" />
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking authentication…</span>
        </div>
      </div>
    );
  }

  // Not logged in — render nothing (redirect effect is firing)
  if (!isLoggedIn) return null;

  // Admin required but not admin — render nothing
  if (requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
