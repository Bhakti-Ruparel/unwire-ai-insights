import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { getProjectOverview } from "@/services/projectService";
import type { ProjectOverview } from "@/types/project";
import { Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/architecture")({
  component: ArchitecturePage,
});

function ArchitecturePage() {
  const { projectId } = useParams({ from: "/projects/$projectId/architecture" });

  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectOverview(projectId)
      .then((ov) => {
        if (!ov) setError("Architecture data not available.");
        else setOverview(ov);
      })
      .catch(() => setError("Unable to load architecture."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Architecture</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Automatically generated from your codebase analysis.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading architecture…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && overview && (
        <div className="glass rounded-2xl p-6">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-6 text-xs text-muted-foreground">
            {overview.architectureNodes.map((n) => (
              <div key={n.id} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${
                  n.type === "frontend"  ? "bg-blue-400"   :
                  n.type === "api"       ? "bg-primary"    :
                  n.type === "backend"   ? "bg-accent"     :
                  n.type === "database"  ? "bg-purple-400" :
                  "bg-orange-400"
                }`} />
                <span>{n.label}</span>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mx-auto">
            {/* No fallback — only backend nodes */}
            <ArchitectureDiagram
              nodes={overview.architectureNodes}
              edges={overview.architectureEdges}
            />
          </div>

          {/* Stack summary below diagram */}
          {overview.architectureNodes.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border grid sm:grid-cols-2 gap-3 text-sm">
              {overview.architectureNodes.map((n) => (
                <div key={n.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0 text-[10px] font-mono uppercase">
                    {n.type?.[0] ?? "?"}
                  </div>
                  <div>
                    <div className="font-medium">{n.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">{n.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
