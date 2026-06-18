import {
  createFileRoute,
  Link,
  Outlet,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState, useRef } from "react";
import { getProject, downloadProjectReport } from "@/services/projectService";
import type { Project } from "@/types/project";
import {
  Boxes,
  Database,
  MessagesSquare,
  Network,
  Package,
  Server,
  LayoutGrid,
  ChevronLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  Zap,
  FileDown,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  head: ({ params }) => ({
    meta: [{ title: `Project · Unwire AI` }],
  }),
  component: ProjectShell,
});

const TABS = [
  { key: "", label: "Overview", icon: LayoutGrid },
  { key: "architecture", label: "Architecture", icon: Network },
  { key: "apis", label: "APIs", icon: Boxes },
  { key: "backend", label: "Backend", icon: Server },
  { key: "database", label: "Database", icon: Database },
  { key: "dependencies", label: "Dependencies", icon: Package },
  { key: "services", label: "Services", icon: Zap },
  { key: "chat", label: "AI Chat", icon: MessagesSquare },
];

function ProjectShell() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/projects/${projectId}`;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnalyzing = project?.analysisStatus === "processing" || project?.analysisStatus === "queued";

  const fetchProject = async () => {
    try {
      const p = await getProject(projectId);
      if (!p) {
        setError("Project not found.");
        return;
      }
      setProject(p);
      if (p.analysisStatus === "complete" || p.analysisStatus === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      setError("Unable to load project.");
    } finally {
      setLoading(false);
    }
  };

  async function handleDownloadReport() {
    if (!project) return;
    setDownloading(true);
    try {
      const markdown = await downloadProjectReport(projectId);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-report.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch {
      toast.error("Failed to generate report.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProject();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [projectId]);

  // Poll while analysis is in progress
  useEffect(() => {
    if (!project) return;
    if (isAnalyzing && !pollRef.current) {
      pollRef.current = setInterval(fetchProject, 3000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [project?.analysisStatus]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />
      <div className="mx-auto max-w-7xl px-6 py-6 grid lg:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-20 h-fit">
          <Link
            to="/projects"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-3"
          >
            <ChevronLeft className="h-3 w-3" /> All projects
          </Link>

          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-mono">PROJECT</div>
            {loading ? (
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : error ? (
              <div className="mt-2 flex items-center gap-2 text-destructive text-xs">
                <AlertCircle className="h-3 w-3" /> {error}
              </div>
            ) : (
              <>
                <div className="mt-1 font-semibold">{project?.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{project?.framework}</div>
              </>
            )}
          </div>

          <nav className="mt-4 space-y-0.5">
            {TABS.map((t) => {
              const to = t.key ? `${base}/${t.key}` : base;
              const active = t.key
                ? pathname.endsWith("/" + t.key)
                : pathname === base || pathname === base + "/";
              return (
                <Link
                  key={t.label}
                  to={to}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-secondary/60 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                  }`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>

          {/* Download Report button */}
          {project?.analysisStatus === "complete" && (
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm border border-border hover:bg-secondary/30 transition disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              {downloading ? "Generating…" : "Download Report"}
            </button>
          )}
        </aside>

        {/* Main content */}
        <main className="min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Analyzing your project…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : isAnalyzing ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <span className="text-sm">Analyzing your project…</span>
              <span className="text-xs text-muted-foreground">Analysis in progress. Dashboard will update automatically.</span>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
