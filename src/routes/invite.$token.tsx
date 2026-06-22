/**
 * invite.$token.tsx
 *
 * Invitation acceptance page with proper state machine.
 *
 * States:
 *   CHECKING_INVITATION → fetching token details from backend
 *   INVITATION_VALID    → show org name + accept button (or auto-accept)
 *   LOGIN_REQUIRED      → user not authenticated, show login/signup
 *   EMAIL_MISMATCH      → logged in user email ≠ invitation email
 *   ACCEPTING           → calling accept API
 *   COMPLETED           → membership created, redirecting
 *   ERROR               → invalid/expired token or API error
 */

import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { acceptInvitation, getInvitationInfo, type InvitationInfo } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import {
  CheckCircle2, Loader2, XCircle, Users, LogOut, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept Invitation · Unwire AI" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    autoAccept: search.autoAccept === "1" || search.autoAccept === "true",
  }),
  component: InviteAcceptPage,
});

type PageState =
  | "CHECKING_INVITATION"
  | "INVITATION_VALID"
  | "LOGIN_REQUIRED"
  | "EMAIL_MISMATCH"
  | "ACCEPTING"
  | "COMPLETED"
  | "ERROR";

function InviteAcceptPage() {
  const { token } = useParams({ from: "/invite/$token" });
  const { autoAccept } = Route.useSearch();
  const { isLoggedIn, loading: authLoading, user, logout } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<PageState>("CHECKING_INVITATION");
  const [invite, setInvite] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState("");
  const acceptAttempted = useRef(false);

  // Step 1: Fetch invitation info on mount
  useEffect(() => {
    fetchInviteInfo();
  }, []);

  // Step 2: Once auth resolves and invite is loaded, determine state
  useEffect(() => {
    if (authLoading) return;
    if (!invite) return; // Still loading invite info
    if (state === "ACCEPTING" || state === "COMPLETED" || state === "ERROR") return;

    if (!isLoggedIn) {
      setState("LOGIN_REQUIRED");
      return;
    }

    // User is logged in — check email match
    const userEmail = user?.email?.toLowerCase() ?? "";
    const inviteEmail = invite.email.toLowerCase();

    if (userEmail !== inviteEmail) {
      setState("EMAIL_MISMATCH");
      return;
    }

    // Email matches — ready to accept
    setState("INVITATION_VALID");

    // Auto-accept if returning from login/signup
    if (autoAccept && !acceptAttempted.current) {
      acceptAttempted.current = true;
      doAccept();
    }
  }, [authLoading, isLoggedIn, user, invite, state]);

  async function fetchInviteInfo() {
    setState("CHECKING_INVITATION");
    const info = await getInvitationInfo(token);
    if (!info) {
      setError("This invitation link is invalid or has been removed.");
      setState("ERROR");
      return;
    }
    if (info.status !== "PENDING") {
      if (info.status === "ACCEPTED") setError("This invitation has already been accepted.");
      else if (info.status === "EXPIRED" || info.expired) setError("This invitation has expired. Please ask for a new one.");
      else if (info.status === "REVOKED") setError("This invitation has been revoked.");
      else setError("This invitation is no longer valid.");
      setState("ERROR");
      return;
    }
    if (info.expired) {
      setError("This invitation has expired. Please ask for a new one.");
      setState("ERROR");
      return;
    }
    setInvite(info);
  }

  async function doAccept() {
    setState("ACCEPTING");
    try {
      await acceptInvitation(token);
      setState("COMPLETED");
      setTimeout(() => navigate({ to: "/overview" } as any), 2000);
    } catch (e: any) {
      setError(e.message ?? "Failed to accept invitation.");
      setState("ERROR");
    }
  }

  async function handleLogoutAndRetry() {
    await logout();
    // After logout, the state will change and show LOGIN_REQUIRED
  }

  // ─── Render based on state ──────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
        {state === "CHECKING_INVITATION" && (
          <>
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Checking invitation...</p>
          </>
        )}

        {state === "INVITATION_VALID" && invite && (
          <>
            <Users className="h-10 w-10 mx-auto text-primary mb-4" />
            <h2 className="text-lg font-semibold">Join {invite.organizationName}</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-2">
              You've been invited to join <strong className="text-foreground">{invite.organizationName}</strong> on Unwire AI.
            </p>
            <div className="glass rounded-lg p-3 mb-5 text-xs text-left space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Role:</span><span className="font-medium">{invite.role}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span className="font-medium">{invite.email}</span></div>
            </div>
            <button onClick={doAccept} className="btn-primary-grad px-8 py-2.5 rounded-lg text-sm font-medium w-full">
              Accept & Join Organization
            </button>
          </>
        )}

        {state === "LOGIN_REQUIRED" && invite && (
          <>
            <Users className="h-10 w-10 mx-auto text-primary mb-4" />
            <h2 className="text-lg font-semibold">Join {invite.organizationName}</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-1">
              You've been invited as <strong className="text-foreground">{invite.role}</strong>.
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              Sign in with <strong className="text-foreground">{invite.email}</strong> to accept.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate({ to: "/login", search: { returnTo: `/invite/${token}?autoAccept=1` } })}
                className="w-full btn-primary-grad px-6 py-2.5 rounded-lg text-sm font-medium"
              >
                Log In
              </button>
              <button
                onClick={() => navigate({ to: "/signup", search: { returnTo: `/invite/${token}?autoAccept=1` } } as any)}
                className="w-full glass px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary/60 transition"
              >
                Create Account
              </button>
            </div>
          </>
        )}

        {state === "EMAIL_MISMATCH" && invite && (
          <>
            <AlertTriangle className="h-10 w-10 mx-auto text-yellow-400 mb-4" />
            <h2 className="text-lg font-semibold">Wrong Account</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-4">
              You are logged in as <strong className="text-foreground">{user?.email}</strong>.
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              This invitation was sent to <strong className="text-foreground">{invite.email}</strong>.
              Please log out and sign in with the correct account.
            </p>
            <button
              onClick={handleLogoutAndRetry}
              className="w-full btn-primary-grad px-6 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" /> Log Out & Switch Account
            </button>
          </>
        )}

        {state === "ACCEPTING" && (
          <>
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Joining organization...</p>
          </>
        )}

        {state === "COMPLETED" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-400 mb-3" />
            <h2 className="text-lg font-semibold">Welcome to the team!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You've been added to <strong className="text-foreground">{invite?.organizationName}</strong>. Redirecting to dashboard...
            </p>
          </>
        )}

        {state === "ERROR" && (
          <>
            <XCircle className="h-10 w-10 mx-auto text-red-400 mb-3" />
            <h2 className="text-lg font-semibold">Invitation Error</h2>
            <p className="text-sm text-red-400 mt-2">{error}</p>
            <button onClick={() => navigate({ to: "/overview" } as any)} className="mt-5 glass px-5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition">
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
