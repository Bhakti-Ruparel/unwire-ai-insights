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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading schema…</span>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (tables.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Database className="h-10 w-10 opacity-30" />
          <p className="text-sm">No database schema detected.</p>
          <p className="text-xs max-w-xs text-center">
            Schema is extracted from Prisma models, Mongoose schemas, and SQL CREATE TABLE statements.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {tables.length} table{tables.length !== 1 ? "s" : ""} detected — extracted from schema definitions.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {tables.map((t) => (
          <div key={t.table} className="glass rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
              <Database className="h-4 w-4 text-accent shrink-0" />
              <span className="font-mono font-semibold">{t.table}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t.fields.length} fields</span>
            </div>
            {/* Field list */}
            <ul className="divide-y divide-border">
              {t.fields.length > 0 ? (
                t.fields.map((f, fi) => {
                  // Each field may be "name: type" or just "name"
                  const colonIdx = f.indexOf(":");
                  const fieldName = colonIdx > -1 ? f.slice(0, colonIdx).trim() : f;
                  const fieldType = colonIdx > -1 ? f.slice(colonIdx + 1).trim() : "";
                  return (
                    <li key={fi} className="px-4 py-2 flex items-center justify-between gap-4">
                      <span className="font-mono text-sm">{fieldName}</span>
                      {fieldType && (
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{fieldType}</span>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="px-4 py-3 text-sm text-muted-foreground">No fields detected</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
