import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { getProjectDeployment, refreshProjectDeployment } from "@/services/projectService";
import type {
  DeploymentAnalysis,
  DeploymentIssue,
  DeploymentRecommendation,
  DeploymentArchNode,
  DeploymentArchEdge,
} from "@/types/project";
import {
  Loader2, AlertCircle, RefreshCw, ShieldAlert, ShieldCheck,
  Info, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Rocket, FileCode2, Lightbulb, GitBranch, Terminal,
} from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/deployment")({
  component: DeploymentPage,
});

const POLL_INTERVAL_MS = 4000;

// ─── Severity helpers ──────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  CRITICAL: { icon: XCircle,       color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",    label: "Critical" },
  WARNING:  { icon: AlertCircle,   color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Warning" },
  INFO:     { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",  label: "Info" },
} as const;

const CATEGORY_ICON: Record<string, React.ElementType> = {
  docker:     FileCode2,
  ci_cd:      GitBranch,
  security:   ShieldAlert,
  nginx:      Terminal,
  kubernetes: Terminal,
  config:     FileCode2,
  cloud:      Rocket,
  environment:FileCode2,
};

// ─── Score ring ───────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary/40" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ─── Issue item ───────────────────────────────────────────────────────────

function IssueItem({ issue }: { issue: DeploymentIssue }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.INFO;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{issue.message}</div>
          {issue.file && (
            <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {issue.file}{issue.line ? `:${issue.line}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>
      {open && issue.suggestion && (
        <div className="px-4 pb-3 pt-0 border-t border-border/40">
          <div className="text-xs text-muted-foreground mt-2">
            <span className="font-semibold text-foreground">Fix: </span>
            {issue.suggestion}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recommendation item ──────────────────────────────────────────────────

function RecItem({ rec }: { rec: DeploymentRecommendation }) {
  const [open, setOpen] = useState(false);
  const CatIcon = CATEGORY_ICON[rec.category] ?? Lightbulb;

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
      >
        <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <CatIcon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{rec.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rec.description}</div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border space-y-3">
          <p className="text-sm text-muted-foreground mt-3">{rec.description}</p>
          {rec.codeSnippet && (
            <pre className="bg-secondary/60 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre text-muted-foreground border border-border">
              {rec.codeSnippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Architecture diagram ─────────────────────────────────────────────────

const NODE_STYLE: Record<string, { border: string; dot: string }> = {
  user:       { border: "border-blue-500/40",   dot: "bg-blue-400"   },
  proxy:      { border: "border-green-500/40",  dot: "bg-green-400"  },
  container:  { border: "border-primary/40",    dot: "bg-primary"    },
  backend:    { border: "border-accent/40",     dot: "bg-accent"     },
  database:   { border: "border-purple-500/40", dot: "bg-purple-400" },
  ci_cd:      { border: "border-yellow-500/40", dot: "bg-yellow-400" },
  cloud:      { border: "border-cyan-500/40",   dot: "bg-cyan-400"   },
  external:   { border: "border-orange-500/40", dot: "bg-orange-400" },
};

function DeploymentArchDiagram({
  nodes, edges,
}: {
  nodes: DeploymentArchNode[];
  edges: DeploymentArchEdge[];
}) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
        <Rocket className="h-8 w-8 opacity-30" />
        <p className="text-sm">No architecture data detected.</p>
      </div>
    );
  }

  // Lay out nodes in a vertical stack (same as architecture page)
  const spacing = 100 / (nodes.length + 1);

  return (
    <div className="relative w-full" style={{ minHeight: `${nodes.length * 80}px` }}>
      <div className="absolute inset-0 grid-bg rounded-xl" />
      <svg
        viewBox={`0 0 100 ${nodes.length * 20 + 10}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <linearGradient id="dep-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.18 265)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="oklch(0.78 0.16 195)" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {edges.map((e, i) => {
          const fromIdx = nodes.findIndex((n) => n.id === e.from);
          const toIdx   = nodes.findIndex((n) => n.id === e.to);
          if (fromIdx === -1 || toIdx === -1) return null;
          const y1 = (fromIdx + 1) * spacing + 2;
          const y2 = (toIdx   + 1) * spacing - 2;
          return (
            <line key={i} x1="50" y1={`${y1}%`} x2="50" y2={`${y2}%`}
              stroke="url(#dep-grad)" strokeWidth="0.5" />
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const style = NODE_STYLE[n.type] ?? NODE_STYLE.container;
        return (
          <div
            key={n.id}
            className={`absolute left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2.5 min-w-[160px] text-center border ${style.border}`}
            style={{ top: `${((i + 1) * spacing) - 5}%` }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              <span className="text-sm font-medium">{n.label}</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">{n.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

function DeploymentPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/deployment" });

  const [data,        setData]        = useState<DeploymentAnalysis | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isProcessing = data?.status === "pending" || data?.status === "processing";

  const load = async () => {
    try {
      const result = await getProjectDeployment(projectId);
      setData(result);
      if (result?.status === "complete" || result?.status === "failed") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch {
      setError("Unable to load deployment analysis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [projectId]);

  // Poll while processing
  useEffect(() => {
    if (!data) return;
    if (isProcessing && !pollRef.current) {
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [data?.status]);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshProjectDeployment(projectId);
    setTimeout(() => {
      load();
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
      setRefreshing(false);
    }, 800);
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Deployment</h2>
        <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading deployment analysis…</span>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Deployment</h2>
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // ── Processing ──────────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Deployment</h2>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <p className="text-sm">Analyzing deployment configuration…</p>
          <p className="text-xs">This runs in the background and updates automatically.</p>
        </div>
      </div>
    );
  }

  // ── No data ─────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Deployment</h2>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Rocket className="h-10 w-10 opacity-30" />
          <p className="text-sm">No deployment analysis available yet.</p>
          <button onClick={handleRefresh} className="btn-primary-grad px-4 py-2 rounded-md text-sm font-medium">
            Run Analysis
          </button>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const criticals = data.issues.filter((i) => i.severity === "CRITICAL");
  const warnings  = data.issues.filter((i) => i.severity === "WARNING");
  const infos     = data.issues.filter((i) => i.severity === "INFO");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Deployment Intelligence</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Deployment readiness analysis based on your project files.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-border hover:bg-secondary/30 transition disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Score + breakdown */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-8">
          {/* Ring */}
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={data.score} />
            <div className="text-sm font-medium">Deployment Score</div>
          </div>

          {/* Score breakdown bars */}
          <div className="flex-1 grid sm:grid-cols-2 gap-3 min-w-0">
            {Object.values(data.scoreBreakdown).map((cat) => (
              <div key={cat.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{cat.label}</span>
                  <span className="font-mono font-medium">{cat.score}/{cat.max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${(cat.score / cat.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detected files */}
      {data.filesDetected.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <div className="text-sm font-medium mb-3">
            Deployment Files Detected ({data.filesDetected.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {data.filesDetected.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-lg bg-secondary/60 border border-border">
                <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                {f.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues + Recommendations side by side on large screens */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Issues */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Issues ({data.issues.length})</div>
            <div className="flex gap-2 text-xs">
              {criticals.length > 0 && <span className="text-red-400">{criticals.length} critical</span>}
              {warnings.length  > 0 && <span className="text-yellow-400">{warnings.length} warnings</span>}
              {infos.length     > 0 && <span className="text-blue-400">{infos.length} info</span>}
            </div>
          </div>

          {data.issues.length === 0 ? (
            <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 border border-green-500/30 text-green-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="text-sm">No deployment issues found.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {[...criticals, ...warnings, ...infos].map((iss) => (
                <IssueItem key={iss.id} issue={iss} />
              ))}
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <div className="text-sm font-medium">
            Recommendations ({data.recommendations.length})
          </div>

          {data.recommendations.length === 0 ? (
            <div className="flex items-center gap-2 glass rounded-xl px-4 py-3 border border-green-500/30 text-green-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="text-sm">No recommendations — deployment is well configured.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recommendations.map((rec) => (
                <RecItem key={rec.id} rec={rec} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Architecture diagram */}
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-medium mb-4">Deployment Architecture</div>
        <DeploymentArchDiagram
          nodes={data.architectureNodes}
          edges={data.architectureEdges}
        />
      </div>

      {/* Last updated */}
      <p className="text-xs text-muted-foreground text-right">
        Last analyzed: {new Date(data.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
