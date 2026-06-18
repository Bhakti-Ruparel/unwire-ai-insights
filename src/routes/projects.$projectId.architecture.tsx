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
      .then((ov) => setOverview(ov))
      .catch(() => setError("Unable to load architecture."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Architecture</h2>
      <p className="text-muted-foreground text-sm">
        Click any node to inspect its files and connections.
      </p>

      {loading && (
        <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Analyzing project…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="glass rounded-2xl p-6">
          <div className="max-w-3xl mx-auto">
            <ArchitectureDiagram nodes={overview?.architectureNodes} />
          </div>
        </div>
      )}
    </div>
  );
}
