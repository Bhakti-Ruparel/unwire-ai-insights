import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectDependencies } from "@/services/projectService";
import type { Dependency, DependencyType } from "@/types/project";
import { Package, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/dependencies")({
  component: DependenciesPage,
});

const TYPE_COLORS: Record<DependencyType, string> = {
  runtime: "text-accent bg-accent/10 border-accent/30",
  dev:     "text-blue-300 bg-blue-500/10 border-blue-500/30",
  peer:    "text-yellow-300 bg-yellow-500/10 border-yellow-500/30",
};

function DependenciesPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/dependencies" });

  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [filter, setFilter] = useState<DependencyType | "all">("all");
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

  const filtered = filter === "all" ? dependencies : dependencies.filter((d) => d.type === filter);
  const counts = {
    all:     dependencies.length,
    runtime: dependencies.filter((d) => d.type === "runtime").length,
    dev:     dependencies.filter((d) => d.type === "dev").length,
    peer:    dependencies.filter((d) => d.type === "peer").length,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading dependencies…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (dependencies.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">No dependencies detected.</p>
          <p className="text-xs">Dependencies are parsed from package.json, requirements.txt, pom.xml, and go.mod.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {dependencies.length} package{dependencies.length !== 1 ? "s" : ""} detected.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {(["all", "runtime", "dev", "peer"] as const).map((t) =>
            counts[t] > 0 || t === "all" ? (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                  filter === t
                    ? "bg-secondary/60 border-border text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                <span className="ml-1.5 opacity-60">{counts[t]}</span>
              </button>
            ) : null
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((d) => (
          <div key={`${d.name}-${d.type}`} className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0">
              <Package className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono font-medium text-sm truncate">{d.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">{d.version || "—"}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${TYPE_COLORS[d.type] ?? TYPE_COLORS.runtime}`}>
                  {d.type}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
