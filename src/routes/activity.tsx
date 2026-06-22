import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { fetchProjects, fetchServers } from "@/services/api";
import type { Project, Server } from "@/types/project";
import {
  Clock, Server as ServerIcon, FolderOpen, Rocket,
  Zap, Loader2, Activity, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity · Unwire AI" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [servers, setServers]   = useState<Server[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchServers()])
      .then(([p, s]) => { setProjects(p); setServers(s); })
      .finally(() => setLoading(false));
  }, []);

  // Build activity timeline from existing data
  const events = [
    ...projects.map((p) => ({
      type: "project" as const, icon: FolderOpen, color: "text-purple-400 bg-purple-500/10",
      title: `Project analyzed`, sub: p.name, time: p.lastAnalyzed || p.updatedAt,
    })),
    ...servers.map((s) => ({
      type: "server" as const, icon: ServerIcon, color: "text-blue-400 bg-blue-500/10",
      title: `Server connected`, sub: s.name, time: s.createdAt,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 20);

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="max-w-[800px] mx-auto px-6 py-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />Activity
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Recent events and actions across your infrastructure</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading activity…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <Activity className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Events will appear as you use Unwire AI</p>
            </div>
          ) : (
            <div className="glass rounded-2xl p-5">
              <div className="space-y-1">
                {events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${ev.color}`}>
                      <ev.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm"><span className="font-medium">{ev.title}</span> <span className="text-muted-foreground">{ev.sub}</span></div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">{ev.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
