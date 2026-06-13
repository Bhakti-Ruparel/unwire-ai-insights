import { createFileRoute } from "@tanstack/react-router";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";

export const Route = createFileRoute("/projects/$projectId/architecture")({
  component: () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Architecture</h2>
      <p className="text-muted-foreground text-sm">Click any node to inspect its files and connections.</p>
      <div className="glass rounded-2xl p-6">
        <div className="max-w-3xl mx-auto"><ArchitectureDiagram /></div>
      </div>
    </div>
  ),
});
