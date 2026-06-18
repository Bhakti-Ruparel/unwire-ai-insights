import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectBackend } from "@/services/projectService";
import type { BackendInfo } from "@/types/project";
import { Loader2, AlertCircle, Server, ArrowDown } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/backend")({
  component: BackendPage,
});

function BackendPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/backend" });

  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectBackend(projectId)
      .then((b) => {
        // 404 from the service returns null — show "no data" rather than error
        setBackend(b);
      })
      .catch(() => setError("Unable to load backend info."))
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading backend info…</span>
        </div>
      </div>
    );
  }

  // ── Network / fetch error ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // ── No backend data (404 / analysis not complete yet) ────────────────────
  if (!backend) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Server className="h-10 w-10 opacity-30" />
          <p className="text-sm">No backend data detected yet.</p>
          <p className="text-xs">Upload a project with a backend framework to see this data.</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const stats = [
    { label: "Framework",   value: backend.framework        || "—" },
    { label: "Routes",      value: backend.routesCount > 0 ? String(backend.routesCount) : "—" },
    { label: "Controllers", value: backend.controllersCount > 0 ? String(backend.controllersCount) : "—" },
    { label: "Middleware",  value: backend.middleware.length > 0 ? backend.middleware.join(" · ") : "—" },
  ];

  // Parse request flow into steps for visual display
  const flowSteps = backend.requestFlow
    ? backend.requestFlow.split("→").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {stats.map((c) => (
          <div key={c.label} className="glass rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
              {c.label}
            </div>
            <div className="mt-2 text-lg font-semibold truncate">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Request flow */}
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-medium mb-4">Request flow</div>
        {flowSteps.length > 0 ? (
          <div className="flex flex-col items-start gap-0">
            {flowSteps.map((step, i) => (
              <div key={i} className="flex flex-col items-start">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                  </div>
                  <span className="text-sm font-mono">{step}</span>
                </div>
                {i < flowSteps.length - 1 && (
                  <div className="ml-3 my-0.5">
                    <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No request flow data available.</p>
        )}
      </div>
    </div>
  );
}
