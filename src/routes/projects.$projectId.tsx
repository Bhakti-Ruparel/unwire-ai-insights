import {
  createFileRoute,
  Link,
  Outlet,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { ChatPanel } from "@/components/ChatPanel";
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
  Zap,
  FileDown,
  Rocket,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({ meta: [{ title: `Project · Unwire AI` }] }),
  component: ProjectShell,
});

// ── Sidebar tabs — AI Chat removed (it's now a slide-in panel) ─────────────
const TABS = [
  { key: "",             label: "Overview",      icon: LayoutGrid  },
  { key: "architecture", label: "Architecture",  icon: Network     },
  { key: "apis",         label: "APIs",          icon: Boxes       },
  { key: "backend",      label: "Backend",       icon: Server      },
  { key: "database",     label: "Database",      icon: Database    },
  { key: "dependencies", label: "Dependencies",  icon: Package     },
  { key: "services",     label: "Services",      icon: Zap         },
  { key: "deployment",   label: "Deployment",    icon: Rocket      },
];

function ProjectShell() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const pathname  = useRouterState({ select: (s) => s.location.pathname });
  const base      = `/projects/${projectId}`;

  const [project,    setProject]    = useState<Project | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [chatOpen,   setChatOpen]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnalyzing =
    project?.analysisStatus === "processing" || project?.analysisStatus === "queued";

  // ── Fetch project ─────────────────────────────────────────────────────────
  const fetchProject = async () => {
    try {
      const p = await getProject(projectId);
      if (!p) { setError("Project not found."); return; }
      setProject(p);
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
    fetchProject();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    if (isAnalyzing && !pollRef.current) {
      pollRef.current = setInterval(fetchProject, 3000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [project?.analysisStatus]);

  // ── Download report ────────────────────────────────────────────────────────
  async function handleDownloadReport() {
    if (!project) return;
    setDownloading(true);
    try {
      const markdown = await downloadProjectReport(projectId);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />

      <div className="mx-auto max-w-7xl px-6 py-6 grid lg:grid-cols-[240px_1fr] gap-6">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-20 h-fit">
          <Link
            to="/projects"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-3"
          >
            <ChevronLeft className="h-3 w-3" /> All projects
          </Link>

          {/* Project info card */}
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
                <div className="mt-1 font-semibold truncate">{project?.name}</div>
                {project?.framework && (
                  <div className="mt-0.5 text-xs text-muted-foreground font-mono">{project.framework}</div>
                )}
                {project?.stack && project.stack.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {project.stack.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="mt-4 space-y-0.5">
            {TABS.map((t) => {
              const to     = t.key ? `${base}/${t.key}` : base;
              const active = t.key
                ? pathname.endsWith("/" + t.key)
                : pathname === base || pathname === base + "/";
              return (
                <Link
                  key={t.key}
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

          {/* AI Chat toggle — triggers right-side panel */}
          <div className="mt-2">
            <button
              onClick={() => setChatOpen((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                chatOpen
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              <MessagesSquare className="h-4 w-4" />
              AI Chat
              {chatOpen && (
                <span className="ml-auto text-[10px] font-mono text-primary/70 border border-primary/30 px-1 rounded">
                  open
                </span>
              )}
            </button>
          </div>

          {/* Download Report */}
          {project?.analysisStatus === "complete" && (
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm border border-border hover:bg-secondary/30 transition disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              {downloading ? "Generating…" : "Download Report"}
            </button>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Loading project…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* ── Right-side resizable chat panel ────────────────────────────────── */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        project={project}
      />
    </div>
  );
}
