import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectBackend } from "@/services/projectService";
import type { BackendInfo } from "@/types/project";
import { Loader2, AlertCircle } from "lucide-react";

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
        if (!b) setError("Backend information not found.");
        else setBackend(b);
      })
      .catch(() => setError("Unable to load backend info."))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Analyzing project…</span>
        </div>
      </div>
    );
  }

  if (error || !backend) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error ?? "Unable to load backend info."}</span>
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Framework", value: backend.framework },
    { label: "Routes", value: String(backend.routesCount) },
    { label: "Controllers", value: String(backend.controllersCount) },
    { label: "Middleware", value: backend.middleware.join(" · ") },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
              {c.label}
            </div>
            <div className="mt-2 text-lg font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-medium">Request flow</div>
        <pre className="mt-3 text-xs font-mono text-muted-foreground leading-6 whitespace-pre-wrap break-words">
          {backend.requestFlow}
        </pre>
      </div>
    </div>
  );
}
