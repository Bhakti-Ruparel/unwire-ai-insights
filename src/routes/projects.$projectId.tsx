import { createFileRoute, Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { getProject } from "@/lib/mock-data";
import { Boxes, Database, MessagesSquare, Network, Package, Server, LayoutGrid, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId")({
  head: ({ params }) => ({ meta: [{ title: `${params.projectId} · Unwire AI` }] }),
  component: ProjectShell,
});

const TABS = [
  { key: "", label: "Overview", icon: LayoutGrid },
  { key: "architecture", label: "Architecture", icon: Network },
  { key: "apis", label: "APIs", icon: Boxes },
  { key: "backend", label: "Backend", icon: Server },
  { key: "database", label: "Database", icon: Database },
  { key: "dependencies", label: "Dependencies", icon: Package },
  { key: "chat", label: "AI Chat", icon: MessagesSquare },
];

function ProjectShell() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const project = getProject(projectId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/projects/${projectId}`;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-6 py-6 grid lg:grid-cols-[240px_1fr] gap-6">
        <aside className="lg:sticky lg:top-20 h-fit">
          <Link to="/projects" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-3">
            <ChevronLeft className="h-3 w-3" /> All projects
          </Link>
          <div className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground font-mono">PROJECT</div>
            <div className="mt-1 font-semibold">{project.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{project.framework}</div>
          </div>
          <nav className="mt-4 space-y-0.5">
            {TABS.map((t) => {
              const to = t.key ? `${base}/${t.key}` : base;
              const active = t.key ? pathname.endsWith("/" + t.key) : pathname === base || pathname === base + "/";
              return (
                <Link
                  key={t.label}
                  to={to}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${active ? "bg-secondary/60 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"}`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
