import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectDependencies } from "@/services/projectService";
import type { Dependency } from "@/types/project";
import { Package, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/dependencies")({
  component: DependenciesPage,
});

function DependenciesPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/dependencies" });

  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectDependencies(projectId)
      .then(setDependencies)
      .catch(() => setError("Unable to load dependencies."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>

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

      {!loading && !error && dependencies.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No dependencies found for this project.
        </p>
      )}

      {!loading && !error && dependencies.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            {dependencies.length} package{dependencies.length !== 1 ? "s" : ""} used in this project.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dependencies.map((d) => (
              <div key={d.name} className="glass rounded-xl p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.version} · {d.type}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
