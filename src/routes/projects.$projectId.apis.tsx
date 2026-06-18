import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectAPIs } from "@/services/projectService";
import type { APIEndpoint } from "@/types/project";
import { Loader2, AlertCircle, Search, Boxes, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/apis")({
  component: APIsPage,
});

const METHOD_COLOR: Record<string, string> = {
  GET:     "text-accent   bg-accent/10    border-accent/30",
  POST:    "text-primary  bg-primary/10   border-primary/30",
  PUT:     "text-blue-300 bg-blue-500/10  border-blue-500/30",
  PATCH:   "text-yellow-300 bg-yellow-500/10 border-yellow-500/30",
  DELETE:  "text-destructive bg-destructive/10 border-destructive/30",
  HEAD:    "text-muted-foreground bg-secondary/10 border-border",
  OPTIONS: "text-muted-foreground bg-secondary/10 border-border",
};

function APIsPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/apis" });

  const [apis, setApis] = useState<APIEndpoint[]>([]);
  const [search, setSearch] = useState("");
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

  const filtered = search.trim()
    ? apis.filter(
        (a) =>
          a.path.toLowerCase().includes(search.toLowerCase()) ||
          a.method.toLowerCase().includes(search.toLowerCase()) ||
          (a.file ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : apis;

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading API endpoints…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (apis.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Boxes className="h-10 w-10 opacity-30" />
          <p className="text-sm">No API endpoints detected.</p>
          <p className="text-xs">Routes are extracted from Express, FastAPI, Django, and Spring Boot files.</p>
        </div>
      </div>
    );
  }

  const authCount = apis.filter((a) => a.authenticated).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {apis.length} endpoint{apis.length !== 1 ? "s" : ""} detected
            {authCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-green-400">
                <ShieldCheck className="h-3 w-3" />
                {authCount} authenticated
              </span>
            )}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter endpoints…"
            className="pl-8 pr-3 py-2 text-sm bg-secondary/40 border border-border rounded-md outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition w-52"
          />
        </div>
      </div>

      {filtered.length === 0 && search && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No endpoints match "<span className="text-foreground">{search}</span>".
        </p>
      )}

      {filtered.length > 0 && (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 w-24">Method</th>
                <th className="text-left px-4 py-3">Endpoint</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">File</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Middleware</th>
                <th className="text-center px-4 py-3 w-16">Auth</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border hover:bg-secondary/20 transition-colors"
                  title={a.description}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                        METHOD_COLOR[a.method] ?? METHOD_COLOR.GET
                      }`}
                    >
                      {a.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{a.path}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                    {a.file || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                    {a.middleware && a.middleware.length > 0
                      ? a.middleware.map((m) => (
                          <span
                            key={m}
                            className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono"
                          >
                            {m}
                          </span>
                        ))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {a.authenticated ? (
                      <span title="Authentication required">
                        <ShieldCheck className="h-4 w-4 text-green-400 mx-auto" />
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
      )}
    </div>
  );
}
