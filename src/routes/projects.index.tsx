import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { ProjectCard } from "@/components/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import { useProjects } from "@/context/ProjectContext";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Plus, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast, Toaster } from "sonner";
import type { Project } from "@/types/project";

export const Route = createFileRoute("/projects/")({
  head: () => ({ meta: [{ title: "Projects · Unwire AI" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, loading, error, loadProjects, addProject } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  async function handleProjectCreated(newProject: Project) {
    setModalOpen(false);
    toast.success("Project created", {
      description: "Analysis queued — your codebase will be ready shortly.",
    });
    loadProjects();
    navigate({ to: "/projects/$projectId", params: { projectId: newProject.id } });
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />
      <main className="mx-auto max-w-7xl px-6 py-10">

        {/* Page heading */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {user ? `${user.name}'s Projects` : "Your Projects"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Upload a repository and get an AI-powered understanding of your codebase.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary-grad px-4 py-2.5 rounded-md font-medium inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Create New Project
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-8 flex items-center gap-3 glass rounded-xl p-4 border border-destructive/30 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading state */}
        {loading && projects.length === 0 && (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Analyzing project…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="mt-16 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No projects yet. Create your first project.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 btn-primary-grad px-5 py-2.5 rounded-md font-medium inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add Project
            </button>
          </div>
        )}

        {/* Project grid */}
        {projects.length > 0 && (
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}

            {/* Add new card */}
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-2xl border-2 border-dashed border-border min-h-[260px] flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
            >
              <Sparkles className="h-6 w-6" />
              <span className="mt-2 font-medium">Add a new project</span>
              <span className="text-xs">ZIP or GitHub URL</span>
            </button>
          </div>
        )}
      </main>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
