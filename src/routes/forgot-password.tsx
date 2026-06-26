import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requestPasswordReset } from "@/services/api";
import { Logo } from "@/components/Logo";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset Password · Unwire AI" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="text-xl font-bold mt-4">Reset your password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sent ? "Check your email" : "Enter your email to receive a reset link"}
          </p>
        </div>

        {sent ? (
          <div className="glass rounded-xl p-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto" />
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
            </p>
            <p className="text-xs text-muted-foreground">Check your spam folder if you don't see it.</p>
            <Link to="/login" search={{ returnTo: "" }} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Email address</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
              </div>
            </label>
            <button type="submit" disabled={loading}
              className="w-full btn-primary-grad py-2.5 rounded-lg font-medium text-sm disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Send reset link"}
            </button>
            <div className="text-center">
              <Link to="/login" search={{ returnTo: "" }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
