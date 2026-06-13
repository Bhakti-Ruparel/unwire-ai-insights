import { createFileRoute, useParams } from "@tanstack/react-router";
import { getProject } from "@/lib/mock-data";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";

export const Route = createFileRoute("/projects/$projectId/")({
  component: Overview,
});

function Overview() {
  const { projectId } = useParams({ from: "/projects/$projectId/" });
  const p = getProject(projectId);
  const cards = [
    { label: "Framework", value: p.framework },
    { label: "Files", value: p.files },
    { label: "APIs", value: p.apis },
    { label: "Database", value: p.database },
    { label: "Dependencies", value: p.deps },
    { label: "External Services", value: p.external.join(" · ") },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
        <p className="text-muted-foreground mt-1">{p.description}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">{c.label}</div>
            <div className="mt-2 text-xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-medium mb-2">Architecture snapshot</div>
        <div className="max-w-2xl mx-auto"><ArchitectureDiagram /></div>
      </div>
    </div>
  );
}
