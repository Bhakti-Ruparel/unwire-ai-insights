import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { projects } from "@/lib/mock-data";
import { NewProjectModal } from "@/components/NewProjectModal";
import { useState } from "react";
import { Plus, MessageSquare, LayoutDashboard, Clock, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/projects/")({
  head: () => ({ meta: [{ title: "Projects · Unwire AI" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Unwire Your Projects</h1>
            <p className="mt-2 text-muted-foreground">Upload a repository and get an AI-powered understanding of your codebase.</p>
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary-grad px-4 py-2.5 rounded-md font-medium inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create New Project
          </button>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <article key={p.id} className="glass rounded-2xl p-5 flex flex-col hover:bg-secondary/30 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-lg">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.stack.map((s) => (
                  <span key={s} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-secondary/60 border border-border text-muted-foreground">{s}</span>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat n={p.files} l="files" />
                <Stat n={p.apis} l="APIs" />
                <Stat n={p.deps} l="deps" />
              </div>

              <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" /> Last analyzed {p.lastAnalyzed}</div>

              <div className="mt-5 flex gap-2">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="flex-1 btn-primary-grad rounded-md py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5">
                  <LayoutDashboard className="h-4 w-4" /> Open Dashboard
                </Link>
                <Link to="/projects/$projectId/chat" params={{ projectId: p.id }} className="flex-1 glass rounded-md py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-secondary/50 transition">
                  <MessageSquare className="h-4 w-4" /> Chat
                </Link>
              </div>
            </article>
          ))}

          <button onClick={() => setOpen(true)} className="rounded-2xl border-2 border-dashed border-border min-h-[260px] flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition">
            <Sparkles className="h-6 w-6" />
            <span className="mt-2 font-medium">Add a new project</span>
            <span className="text-xs">ZIP or GitHub URL</span>
          </button>
        </div>
      </main>

      <NewProjectModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); toast.success("Project analyzed", { description: "Your codebase is ready to explore." }); }}
      />
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-md bg-secondary/40 border border-border py-2">
      <div className="text-base font-semibold">{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "Analyzed" ? "text-accent border-accent/30 bg-accent/10" : status === "Analyzing" ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground border-border";
  return <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full border ${color}`}>{status}</span>;
}
