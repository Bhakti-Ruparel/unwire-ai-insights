/**
 * architectureService.ts
 *
 * Builds a fully dynamic architecture graph from analysis results.
 * Returns { nodes, edges } where nodes represent detected technology
 * layers and edges represent data-flow connections between them.
 */

import type { ArchitectureNodeDTO } from "../models/Project";

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ArchitectureGraph {
  nodes: ArchitectureNodeDTO[];
  edges: ArchitectureEdge[];
}

interface BuildInput {
  frontendFrameworks: string[];
  backendFrameworks: string[];
  databases: string[];
  externalServices: string[];
  hasTypeScript: boolean;
  apiCount: number;
}

/**
 * buildArchitectureGraph
 *
 * Constructs a dynamic architecture graph from detected stack information.
 * Nodes are only added if there is evidence of that layer in the codebase.
 */
export function buildArchitectureGraph(input: BuildInput): ArchitectureGraph {
  const nodes: ArchitectureNodeDTO[] = [];
  const edges: ArchitectureEdge[] = [];

  const {
    frontendFrameworks,
    backendFrameworks,
    databases,
    externalServices,
    hasTypeScript,
    apiCount,
  } = input;

  // ── Frontend node ────────────────────────────────────────────────────────
  if (frontendFrameworks.length > 0) {
    const feName = frontendFrameworks[0];
    const feSub = hasTypeScript ? `${feName} · TypeScript` : feName;
    nodes.push({ id: "fe", label: "Frontend", sub: feSub, x: 50, y: 8, type: "frontend" });
  }

  // ── API Layer node ────────────────────────────────────────────────────────
  // Add when we have a backend framework and/or detected API routes
  if (backendFrameworks.length > 0 || apiCount > 0) {
    const beName = backendFrameworks[0] ?? "Backend";
    const apiSub = apiCount > 0 ? `REST · ${apiCount} endpoints` : `REST · ${beName}`;
    nodes.push({ id: "api", label: "API Layer", sub: apiSub, x: 50, y: 28, type: "api" });
  }

  // ── Backend / Server node ─────────────────────────────────────────────────
  if (backendFrameworks.length > 0) {
    const beSub = backendFrameworks.join(" · ");
    nodes.push({ id: "be", label: "Backend", sub: beSub, x: 50, y: 48, type: "backend" });
  }

  // ── Database node ─────────────────────────────────────────────────────────
  if (databases.length > 0) {
    const dbSub = databases.join(" · ");
    nodes.push({ id: "db", label: "Database", sub: dbSub, x: 50, y: 68, type: "database" });
  }

  // ── External Services node ───────────────────────────────────────────────
  if (externalServices.length > 0) {
    // Show top-3 service names, then "+N more"
    const top = externalServices.slice(0, 3);
    const rest = externalServices.length - top.length;
    const extSub = rest > 0 ? `${top.join(" · ")} +${rest} more` : top.join(" · ");
    nodes.push({ id: "ext", label: "External APIs", sub: extSub, x: 50, y: 88, type: "external" });
  }

  // ── Fallback: ensure at least one node exists ────────────────────────────
  if (nodes.length === 0) {
    nodes.push({ id: "be", label: "Backend", sub: "Unknown stack", x: 50, y: 48, type: "backend" });
  }

  // ── Build edges (connect consecutive nodes) ──────────────────────────────
  const nodeIds = nodes.map((n) => n.id);
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({ from: nodeIds[i], to: nodeIds[i + 1] });
  }

  return { nodes, edges };
}
