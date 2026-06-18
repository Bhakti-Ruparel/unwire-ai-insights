import type { ArchitectureNode } from "@/types/project";

// Default nodes used on the landing page / when no project data is available
const DEFAULT_NODES: ArchitectureNode[] = [
  { id: "fe", x: 50, y: 8, label: "Frontend", sub: "React • Vite", type: "frontend" },
  { id: "api", x: 50, y: 28, label: "API Layer", sub: "REST • tRPC", type: "api" },
  { id: "be", x: 50, y: 48, label: "Backend", sub: "Node • Express", type: "backend" },
  { id: "db", x: 50, y: 68, label: "Database", sub: "Postgres", type: "database" },
  { id: "ext", x: 50, y: 88, label: "External APIs", sub: "OpenAI • Stripe", type: "external" },
];

interface ArchitectureDiagramProps {
  nodes?: ArchitectureNode[];
}

export function ArchitectureDiagram({ nodes = DEFAULT_NODES }: ArchitectureDiagramProps) {
  return (
    <div className="relative w-full aspect-[4/5] md:aspect-[5/4]">
      <div className="absolute inset-0 grid-bg rounded-2xl" />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1];
          return (
            <line
              key={n.id}
              x1={n.x}
              y1={n.y + 4}
              x2={next.x}
              y2={next.y - 4}
              stroke="url(#g)"
              strokeWidth="0.4"
              className="animate-pulse-line"
            />
          );
        })}
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.18 265)" />
            <stop offset="100%" stopColor="oklch(0.78 0.16 195)" />
          </linearGradient>
        </defs>
      </svg>
      {nodes.map((n, i) => (
        <div
          key={n.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 glass rounded-xl px-4 py-3 min-w-[180px] text-center animate-float"
          style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.3}s` }}
        >
          <div className="text-sm font-medium text-foreground">{n.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">{n.sub}</div>
        </div>
      ))}
    </div>
  );
}
