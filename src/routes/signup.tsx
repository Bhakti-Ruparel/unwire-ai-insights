import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast, Toaster } from "sonner";
import { authSignup } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { AuthShell, Field, Divider, GoogleButton } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account · Unwire AI" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : "",
  }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { returnTo } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authSignup({ name, email, password });
      await refreshUser();
      toast.success("Account created!");
      // Redirect to returnTo (invitation flow) or overview
      const dest = returnTo && returnTo.startsWith("/") ? returnTo : "/overview";
      navigate({ to: dest } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign up failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start unwiring your codebase in seconds">
      <Toaster theme="dark" position="bottom-right" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Name"
          placeholder="Ada Lovelace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary-grad rounded-md py-2.5 font-medium disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <Divider />
      <GoogleButton />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" search={{ returnTo: "" }} className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
