import type { ArchitectureNode, ArchitectureEdge } from "@/types/project";

// ─── Landing-page default nodes (only used outside a project context) ──────
export const LANDING_NODES: ArchitectureNode[] = [
  { id: "fe",  x: 50, y: 8,  label: "Frontend",     sub: "React • Vite",      type: "frontend"  },
  { id: "api", x: 50, y: 28, label: "API Layer",     sub: "REST • Express",    type: "api"       },
  { id: "be",  x: 50, y: 48, label: "Backend",       sub: "Node.js",           type: "backend"   },
  { id: "db",  x: 50, y: 68, label: "Database",      sub: "PostgreSQL",        type: "database"  },
  { id: "ext", x: 50, y: 88, label: "External APIs", sub: "Stripe • SendGrid", type: "external"  },
];

// Node colour map
const NODE_COLORS: Record<string, { border: string; glow: string; dot: string }> = {
  frontend:  { border: "border-blue-500/50",   glow: "shadow-blue-500/20",   dot: "bg-blue-400"   },
  api:       { border: "border-primary/50",    glow: "shadow-primary/20",    dot: "bg-primary"    },
  backend:   { border: "border-accent/50",     glow: "shadow-accent/20",     dot: "bg-accent"     },
  database:  { border: "border-purple-500/50", glow: "shadow-purple-500/20", dot: "bg-purple-400" },
  external:  { border: "border-orange-500/50", glow: "shadow-orange-500/20", dot: "bg-orange-400" },
};

interface ArchitectureDiagramProps {
  /** Backend-generated nodes. Pass undefined only for the landing page. */
  nodes?: ArchitectureNode[];
  /** Backend-generated edges. When present, replaces sequential line drawing. */
  edges?: ArchitectureEdge[];
  /** When true, shows default landing-page nodes if nodes is empty/undefined */
  useLandingFallback?: boolean;
}

export function ArchitectureDiagram({
  nodes,
  edges,
  useLandingFallback = false,
}: ArchitectureDiagramProps) {
  // Resolve which nodes to render
  const activeNodes: ArchitectureNode[] =
    nodes && nodes.length > 0
      ? nodes
      : useLandingFallback
      ? LANDING_NODES
      : [];

  // No data, no fallback → show empty state
  if (activeNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
        <svg className="h-10 w-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <p className="text-sm">No architecture data detected yet.</p>
      </div>
    );
  }

  // Build edge pairs: use provided edges, else fall back to sequential connections
  const edgePairs: Array<{ from: ArchitectureNode; to: ArchitectureNode }> =
    edges && edges.length > 0
      ? edges
          .map((e) => ({
            from: activeNodes.find((n) => n.id === e.from),
            to: activeNodes.find((n) => n.id === e.to),
          }))
          .filter((e): e is { from: ArchitectureNode; to: ArchitectureNode } =>
            e.from != null && e.to != null
          )
      : activeNodes.slice(0, -1).map((n, i) => ({
          from: n,
          to: activeNodes[i + 1],
        }));

  return (
    <div className="relative w-full aspect-[4/5] md:aspect-[5/4]">
      {/* Grid background */}
      <div className="absolute inset-0 grid-bg rounded-2xl" />

      {/* SVG connector lines */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <linearGradient id="arch-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.18 265)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="oklch(0.78 0.16 195)" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {edgePairs.map(({ from, to }, i) => (
          <line
            key={i}
            x1={from.x}
            y1={from.y + 4}
            x2={to.x}
            y2={to.y - 4}
            stroke="url(#arch-gradient)"
            strokeWidth="0.4"
            className="animate-pulse-line"
          />
        ))}
      </svg>

      {/* Nodes */}
      {activeNodes.map((n, i) => {
        const colors = NODE_COLORS[n.type ?? "backend"] ?? NODE_COLORS.backend;
        return (
          <div
            key={n.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 glass rounded-xl px-4 py-3 min-w-[170px] text-center animate-float border ${colors.border} shadow-lg ${colors.glow}`}
            style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.3}s` }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
              <div className="text-sm font-medium text-foreground">{n.label}</div>
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate">{n.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
