import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { fetchProjects, fetchServers } from "@/services/api";
import type { Project, Server } from "@/types/project";
import {
  Server as ServerIcon, FolderOpen, Zap, AlertTriangle,
  CheckCircle2, Clock, Rocket, Activity, Loader2,
  TrendingUp, Shield, MessagesSquare,
} from "lucide-react";

export const Route = createFileRoute("/overview")({
  head: () => ({ meta: [{ title: "Overview · Unwire AI" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [servers, setServers]   = useState<Server[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchServers()])
      .then(([p, s]) => { setProjects(p); setServers(s); })
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const onlineServers = servers.filter(s => s.status === "online").length;
  const totalApps = servers.reduce((sum, s) => sum + s.appCount, 0);
  const analyzedProjects = projects.filter(p => p.status === "Analyzed").length;

  const rightPanel = (
    <div className="p-4 space-y-4">
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <MessagesSquare className="h-3 w-3" />AI Summary
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {servers.length === 0 && projects.length === 0
            ? "Welcome to Unwire AI! Connect your first server or upload a project to get started."
            : servers.length === 0
            ? `You have ${projects.length} project${projects.length !== 1 ? "s" : ""} analyzed. Connect a server to enable live monitoring.`
            : onlineServers === servers.length
            ? "All systems operational. No issues detected."
            : `${onlineServers}/${servers.length} servers online. Check offline servers for connectivity.`
          }
        </p>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</div>
        <div className="space-y-2">
          {[
            { label: "Connect Server",  icon: ServerIcon, to: "/servers" },
            { label: "Upload Project",  icon: FolderOpen, to: "/projects" },
            { label: "Ask AI",          icon: MessagesSquare, to: "/assistant" },
          ].map((a) => (
            <a key={a.label} href={a.to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition">
              <a.icon className="h-3.5 w-3.5" />{a.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <DashboardLayout rightPanel={rightPanel}>
        <div className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
          {/* Greeting */}
          <div>
            <h1 className="text-xl font-bold">{greeting}, {user?.name?.split(" ")[0] ?? "there"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Here is your infrastructure health overview</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-16 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Servers", value: String(servers.length), sub: `${onlineServers} online`, icon: ServerIcon, color: "text-blue-400" },
                  { label: "Applications", value: String(totalApps), sub: "running", icon: Zap, color: "text-green-400" },
                  { label: "Projects", value: String(projects.length), sub: `${analyzedProjects} analyzed`, icon: FolderOpen, color: "text-purple-400" },
                  { label: "Alerts", value: "0", sub: "active", icon: AlertTriangle, color: "text-yellow-400" },
                ].map((stat) => (
                  <div key={stat.label} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
                    </div>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Infrastructure summary */}
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-semibold mb-4">Infrastructure Status</div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Servers</div>
                    {servers.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">No servers connected yet</p>
                    ) : servers.map((s) => (
                      <div key={s.id} className="flex items-center gap-2.5 text-sm">
                        <span className={`h-2 w-2 rounded-full ${s.status === "online" ? "bg-green-400" : "bg-gray-400"}`} />
                        <span className="truncate">{s.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{s.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Projects</div>
                    {projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">No projects yet</p>
                    ) : projects.slice(0, 4).map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 text-sm">
                        <span className={`h-2 w-2 rounded-full ${p.status === "Analyzed" ? "bg-green-400" : p.status === "Analyzing" ? "bg-blue-400" : "bg-gray-400"}`} />
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent activity placeholder */}
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />Recent Activity
                </div>
                {projects.length === 0 && servers.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 text-center py-6">
                    Activity will appear here as you use Unwire AI
                  </p>
                ) : (
                  <div className="space-y-3">
                    {projects.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-start gap-3 text-xs">
                        <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <FolderOpen className="h-3 w-3 text-purple-400" />
                        </div>
                        <div>
                          <span className="font-medium">Project analyzed</span>
                          <span className="text-muted-foreground ml-1.5">{p.name}</span>
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">{p.lastAnalyzed}</div>
                        </div>
                      </div>
                    ))}
                    {servers.slice(0, 2).map((s) => (
                      <div key={s.id} className="flex items-start gap-3 text-xs">
                        <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <ServerIcon className="h-3 w-3 text-blue-400" />
                        </div>
                        <div>
                          <span className="font-medium">Server connected</span>
                          <span className="text-muted-foreground ml-1.5">{s.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
