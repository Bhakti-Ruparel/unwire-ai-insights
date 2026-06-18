import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { getProject, getProjectOverview } from "@/services/projectService";
import type { Project, ProjectOverview } from "@/types/project";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/")({
  component: Overview,
});

const POLL_INTERVAL_MS = 3000;

function Overview() {
  const { projectId } = useParams({ from: "/projects/$projectId/" });

  const [project, setProject] = useState<Project | null>(null);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnalyzing =
    project?.analysisStatus === "processing" || project?.analysisStatus === "queued";

  const fetchData = async () => {
    try {
      const [p, ov] = await Promise.all([
        getProject(projectId),
        getProjectOverview(projectId),
      ]);
      if (!p) { setError("Project not found."); return; }
      setProject(p);
      setOverview(ov);
      if (p.analysisStatus === "complete" || p.analysisStatus === "failed") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch {
      setError("Unable to load project.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchData();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [projectId]);

  // Start polling when analysis is in progress
  useEffect(() => {
    if (!project) return;
    if (isAnalyzing && !pollRef.current) {
      pollRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [project?.analysisStatus]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading project…</span>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !project) {
    return (
      <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span className="text-sm">{error ?? "Unable to load project."}</span>
      </div>
    );
  }

  // ── Analysis failed ──────────────────────────────────────────────────────
  if (project.analysisStatus === "failed") {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <span className="text-sm text-destructive font-medium">Analysis failed</span>
        <span className="text-xs text-muted-foreground">
          Something went wrong. Please try uploading again.
        </span>
      </div>
    );
  }

  // ── In progress ──────────────────────────────────────────────────────────
  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="text-sm">Analyzing your project…</span>
        <span className="text-xs">This usually takes a few seconds. We'll refresh automatically.</span>
      </div>
    );
  }

  // ── Stats cards ──────────────────────────────────────────────────────────
  const cards = [
    { label: "Framework",         value: overview?.framework        || "—" },
    { label: "Files",             value: overview?.filesCount       ?? project.filesCount },
    { label: "APIs",              value: overview?.apiCount         ?? project.apiCount },
    { label: "Database",          value: overview?.database         || "—" },
    { label: "Dependencies",      value: overview?.dependenciesCount ?? project.dependenciesCount },
    { label: "External Services", value: overview?.externalServicesCount ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Project name + description */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {project.description || "No description available."}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
              {c.label}
            </div>
            <div className="mt-2 text-xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Architecture snapshot — uses only backend data, no fallback */}
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-medium mb-4">Architecture snapshot</div>
        <div className="max-w-2xl mx-auto">
          <ArchitectureDiagram
            nodes={overview?.architectureNodes}
            edges={overview?.architectureEdges}
          />
        </div>
      </div>
    </div>
  );
}
