import { createFileRoute } from "@tanstack/react-router";
import { schema } from "@/lib/mock-data";
import { Database } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/database")({
  component: () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Database</h2>
      <p className="text-muted-foreground text-sm">Inferred schema from models and migrations.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {schema.map((t) => (
          <div key={t.table} className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              <span className="font-mono font-semibold">{t.table}</span>
            </div>
            <ul className="divide-y divide-border">
              {t.fields.map((f) => (
                <li key={f} className="px-4 py-2 font-mono text-sm text-muted-foreground">{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  ),
});
