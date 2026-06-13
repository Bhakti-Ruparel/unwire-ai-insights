import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, Field, Divider, GoogleButton } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account · Unwire AI" }] }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  return (
    <AuthShell title="Create your account" subtitle="Start unwiring your codebase in seconds">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          setTimeout(() => navigate({ to: "/projects" }), 600);
        }}
        className="space-y-4"
      >
        <Field label="Name" placeholder="Ada Lovelace" />
        <Field label="Email" type="email" placeholder="you@company.com" />
        <Field label="Password" type="password" placeholder="At least 8 characters" />
        <button disabled={loading} className="w-full btn-primary-grad rounded-md py-2.5 font-medium disabled:opacity-60">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <Divider />
      <GoogleButton />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-foreground hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
