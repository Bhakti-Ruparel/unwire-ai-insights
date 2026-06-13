import { createFileRoute } from "@tanstack/react-router";
import { dependencies } from "@/lib/mock-data";
import { Package } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/dependencies")({
  component: () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Dependencies</h2>
      <p className="text-muted-foreground text-sm">{dependencies.length} packages used in this project.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {dependencies.map((d) => (
          <div key={d.name} className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-secondary/60 border border-border flex items-center justify-center">
              <Package className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.version} · {d.type}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
});
