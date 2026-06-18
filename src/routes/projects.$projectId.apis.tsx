import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectAPIs } from "@/services/projectService";
import type { APIEndpoint } from "@/types/project";
import { Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/apis")({
  component: APIsPage,
});

const METHOD_COLOR: Record<string, string> = {
  GET: "text-accent bg-accent/10 border-accent/30",
  POST: "text-primary bg-primary/10 border-primary/30",
  PUT: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  PATCH: "text-yellow-300 bg-yellow-500/10 border-yellow-500/30",
  DELETE: "text-destructive bg-destructive/10 border-destructive/30",
  HEAD: "text-muted-foreground bg-secondary/10 border-border",
  OPTIONS: "text-muted-foreground bg-secondary/10 border-border",
};

function APIsPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/apis" });

  const [apis, setApis] = useState<APIEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectAPIs(projectId)
      .then(setApis)
      .catch(() => setError("Unable to load API endpoints."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>

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

      {!loading && !error && apis.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No API endpoints found for this project.
        </p>
      )}

      {!loading && !error && apis.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            {apis.length} endpoint{apis.length !== 1 ? "s" : ""} discovered across your codebase.
          </p>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Method</th>
                  <th className="text-left px-4 py-3">Endpoint</th>
                  <th className="text-left px-4 py-3">File</th>
                  <th className="text-left px-4 py-3">Middleware</th>
                  <th className="text-right px-4 py-3">Auth</th>
                </tr>
              </thead>
              <tbody>
                {apis.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-border hover:bg-secondary/20"
                    title={a.description}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${METHOD_COLOR[a.method] ?? METHOD_COLOR.GET}`}
                      >
                        {a.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{a.path}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{a.file}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.middleware && a.middleware.length > 0
                        ? a.middleware.join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.authenticated ? (
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
