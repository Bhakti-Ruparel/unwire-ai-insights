import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { useState } from "react";
import { authLogin } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Unwire AI" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { returnTo } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authLogin({ email, password });
      await refreshUser();
      toast.success("Welcome back!");
      // Redirect to original destination or servers dashboard
      const dest = returnTo && returnTo.startsWith("/") ? returnTo : "/overview";
      navigate({ to: dest } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to Unwire AI">
      <Toaster theme="dark" position="bottom-right" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          trailing={<a href="#" className="text-xs text-muted-foreground hover:text-foreground">Forgot?</a>}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary-grad rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Divider />
      <GoogleButton />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/signup" search={{ returnTo: "" }} className="text-foreground hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-6">
        <Logo />
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md glass rounded-2xl p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  trailing,
  ...props
}: { label: string; trailing?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        {trailing}
      </div>
      <input
        {...props}
        className="w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
      />
    </label>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleButton() {
  return (
    <button
      type="button"
      className="w-full glass rounded-md py-2.5 font-medium text-sm flex items-center justify-center gap-2 hover:bg-secondary/40 transition"
    >
      <svg className="h-4 w-4" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.9 2.6 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.7-.2-3.3-.5-4.8H24v9.1h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.4z" />
        <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.2 0 24s.9 7.5 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.4 0 11.8-2.1 15.7-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}
