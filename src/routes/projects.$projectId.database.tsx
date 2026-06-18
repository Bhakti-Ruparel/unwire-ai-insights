import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectSchema } from "@/services/projectService";
import type { DatabaseTable } from "@/types/project";
import { Database, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/database")({
  component: DatabasePage,
});

function DatabasePage() {
  const { projectId } = useParams({ from: "/projects/$projectId/database" });

  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectSchema(projectId)
      .then(setTables)
      .catch(() => setError("Unable to load database schema."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
      <p className="text-muted-foreground text-sm">Inferred schema from models and migrations.</p>

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

      {!loading && !error && tables.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No database schema found for this project.
        </p>
      )}

      {!loading && !error && tables.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {tables.map((t) => (
            <div key={t.table} className="glass rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                <Database className="h-4 w-4 text-accent" />
                <span className="font-mono font-semibold">{t.table}</span>
              </div>
              <ul className="divide-y divide-border">
                {t.fields.map((f) => (
                  <li key={f} className="px-4 py-2 font-mono text-sm text-muted-foreground">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
