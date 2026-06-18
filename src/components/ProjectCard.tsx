import { Link } from "@tanstack/react-router";
import { Clock, LayoutDashboard, MessageSquare } from "lucide-react";
import type { Project } from "@/types/project";

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Project["status"] }) {
  const colorMap: Record<Project["status"], string> = {
    Analyzed: "text-accent border-accent/30 bg-accent/10",
    Analyzing: "text-primary border-primary/30 bg-primary/10",
    Queued: "text-muted-foreground border-border bg-secondary/40",
    Error: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-full border ${colorMap[status]}`}
    >
      {status}
    </span>
  );
}

// ─── Stat Cell ─────────────────────────────────────────────────────────────

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-md bg-secondary/40 border border-border py-2">
      <div className="text-base font-semibold">{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
    </div>
  );
}

// ─── ProjectCard ───────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="glass rounded-2xl p-5 flex flex-col hover:bg-secondary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-lg">{project.name}</h3>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {project.description || "No description provided."}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Stack tags */}
      {project.stack.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.stack.map((s) => (
            <span
              key={s}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-secondary/60 border border-border text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Stat n={project.filesCount} l="files" />
        <Stat n={project.apiCount} l="APIs" />
        <Stat n={project.dependenciesCount} l="deps" />
      </div>

      {/* Last analyzed */}
      <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Last analyzed {project.lastAnalyzed}
      </div>

      {/* Actions */}
      <div className="mt-5 flex gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="flex-1 btn-primary-grad rounded-md py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5"
        >
          <LayoutDashboard className="h-4 w-4" /> Open Dashboard
        </Link>
        <Link
          to="/projects/$projectId/chat"
          params={{ projectId: project.id }}
          className="flex-1 glass rounded-md py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-secondary/50 transition"
        >
          <MessageSquare className="h-4 w-4" /> Chat
        </Link>
      </div>
    </article>
  );
}
