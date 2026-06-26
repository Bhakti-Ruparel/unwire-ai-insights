import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { verifyResetToken, resetPassword } from "@/services/api";
import { Logo } from "@/components/Logo";
import { Loader2, Lock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "New Password · Unwire AI" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ token: (search.token as string) ?? "" }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = useSearch({ from: "/reset-password" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setVerifying(false); return; }
    verifyResetToken(token)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false))
      .finally(() => setVerifying(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally { setLoading(false); }
  }

  if (verifying) return (
    <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><Logo /></div>

        {!token || !valid ? (
          <div className="glass rounded-xl p-6 text-center space-y-4">
            <XCircle className="h-10 w-10 text-red-400 mx-auto" />
            <p className="text-sm">This reset link is invalid or has expired.</p>
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="glass rounded-xl p-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" />
            <h2 className="font-semibold">Password reset!</h2>
            <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
            <Link to="/login" search={{ returnTo: "" }} className="btn-primary-grad px-4 py-2 rounded-lg text-sm font-medium inline-block">
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-center">Set new password</h2>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">New password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="password" required value={password} minLength={8}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                  className="w-full pl-10 pr-3 py-2.5 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Confirm password</span>
              <input type="password" required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password"
                className="w-full px-3 py-2.5 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full btn-primary-grad py-2.5 rounded-lg font-medium text-sm disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Reset Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
