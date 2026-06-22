import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { fetchServers, createServer } from "@/services/api";
import type { Server, CreateServerPayload } from "@/types/project";
import {
  Plus, Loader2, Server as ServerIcon, Cpu, HardDrive, MemoryStick,
  Activity, Network, Zap, CheckCircle2, Globe, X, Shield, Terminal,
  Database, MessagesSquare, AlertTriangle, BarChart3, Rocket,
  FolderOpen, Settings, Bell, ChevronRight, Layout,
  Boxes, Users, Building2, ScrollText, MonitorCheck,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/servers/")({
  head: () => ({ meta: [{ title: "Infrastructure · Unwire AI" }] }),
  component: ServersPage,
});

// ─── Left Sidebar ─────────────────────────────────────────────────────────

function Sidebar() {
  const { user, isAdmin } = useAuth();
  const initials = user?.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const NAV = [
    { label: "GENERAL", items: [
      { to: "/servers",  icon: Layout,       name: "Dashboard" },
      { to: "/projects", icon: FolderOpen,   name: "Projects" },
      { to: "/servers",  icon: ServerIcon,   name: "Servers", active: true },
    ]},
    ...(isAdmin ? [{ label: "ADMIN", items: [
      { to: "/admin", icon: Users, name: "Users" },
      { to: "/admin", icon: Building2, name: "Organizations" },
      { to: "/admin", icon: MonitorCheck, name: "System Monitor" },
      { to: "/admin", icon: ScrollText, name: "Audit Logs" },
    ]}] : []),
  ];

  return (
    <aside className="w-[220px] h-screen bg-[oklch(0.11_0.01_265)] border-r border-border flex flex-col shrink-0 overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono">BETA</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {NAV.map((group) => (
          <div key={group.label}>
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 mb-2">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link key={item.name} to={item.to as any}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    (item as any).active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-border/50">
        <div className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 rounded-full btn-primary-grad flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name ?? "User"}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Right Health Panel ───────────────────────────────────────────────────

function HealthPanel() {
  return (
    <aside className="w-[300px] h-screen border-l border-border bg-[oklch(0.11_0.01_265)] overflow-y-auto shrink-0 p-4 space-y-4">

      {/* Health Score */}
      <div className="glass rounded-xl p-4 text-center">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Server Health Score</div>
        <div className="relative w-24 h-24 mx-auto">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary/30" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="8"
              strokeDasharray={264} strokeDashoffset={264} strokeLinecap="round"
              className="opacity-30" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-muted-foreground/40">—</span>
            <span className="text-[9px] text-muted-foreground/40">/100</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">Connect server for health score</div>
      </div>

      {/* AI Insights */}
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Zap className="h-3 w-3" />AI Insights
        </div>
        <div className="space-y-3">
          {[
            { label: "CPU Analysis",           status: "Awaiting data",   color: "text-muted-foreground/50" },
            { label: "Memory Risk",            status: "Awaiting data",   color: "text-muted-foreground/50" },
            { label: "Application Stability",  status: "Awaiting data",   color: "text-muted-foreground/50" },
            { label: "Security",               status: "Awaiting data",   color: "text-muted-foreground/50" },
          ].map((insight) => (
            <div key={insight.label} className="flex items-center justify-between py-1.5">
              <span className="text-xs">{insight.label}</span>
              <span className={`text-[10px] ${insight.color}`}>{insight.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alerts</div>
        <div className="flex items-center gap-2 text-sm text-green-400/60">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs">No active issues</span>
        </div>
      </div>

      {/* Recent Events */}
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Events</div>
        <div className="text-xs text-muted-foreground/50 text-center py-4">
          Events will appear after server connection
        </div>
      </div>
    </aside>
  );
}

// ─── Center Dashboard Content ─────────────────────────────────────────────

function CenterDashboard({ onAddServer }: { onAddServer: () => void }) {
  const DEMO_APPS = [
    { name: "n8n",          icon: "⚙️", type: "Workflow" },
    { name: "PostgreSQL",   icon: "🐘", type: "Database" },
    { name: "Redis",        icon: "🔴", type: "Cache" },
    { name: "Nginx",        icon: "🌐", type: "Proxy" },
    { name: "Node.js API",  icon: "🟢", type: "Backend" },
    { name: "Next.js Web",  icon: "▲",  type: "Frontend" },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Infrastructure Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your AI-powered server intelligence dashboard</p>
          </div>
          <button onClick={onAddServer}
            className="btn-primary-grad px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> Connect Server
          </button>
        </div>

        {/* Resource Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "CPU",       icon: Cpu,         value: "—" },
            { label: "RAM",       icon: MemoryStick, value: "—" },
            { label: "Disk",      icon: HardDrive,   value: "—" },
            { label: "Network",   icon: Network,     value: "—" },
            { label: "Health",    icon: Activity,    value: "—" },
          ].map((m) => (
            <div key={m.label} className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</span>
              </div>
              <div className="text-2xl font-bold text-muted-foreground/30 font-mono">{m.value}</div>
              <div className="text-[10px] text-muted-foreground/40 mt-1">Connect server to see metrics</div>
              {/* Mini sparkline placeholder */}
              <div className="mt-2 h-5 flex items-end gap-[2px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex-1 rounded-sm bg-secondary/30" style={{ height: `${20 + i * 7}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Visual Infrastructure Map */}
        <div className="glass rounded-2xl p-6">
          <div className="text-sm font-semibold mb-5">Visual Server Architecture Map</div>
          <div className="flex flex-col items-center gap-3">
            {/* Server node */}
            <div className="glass rounded-xl px-5 py-3 border border-border/60 flex items-center gap-3 opacity-70">
              <ServerIcon className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium text-muted-foreground">VPS Server</div>
                <div className="text-[10px] text-muted-foreground/50 font-mono">Connect to see live data</div>
              </div>
            </div>
            {/* Connection lines */}
            <div className="flex items-center gap-1">
              <div className="w-0.5 h-5 bg-border/40 rounded" />
            </div>
            <div className="h-[1px] w-48 bg-gradient-to-r from-transparent via-border/40 to-transparent" />
            {/* App tree */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 w-full mt-2">
              {DEMO_APPS.map((app) => (
                <div key={app.name} className="glass rounded-xl p-3 flex flex-col items-center gap-2 border border-border/30 opacity-50 hover:opacity-70 transition">
                  <span className="text-2xl grayscale">{app.icon}</span>
                  <div className="text-[11px] font-semibold text-muted-foreground/70 truncate w-full text-center">{app.name}</div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground/50">
                    Waiting
                  </span>
                  <div className="w-full space-y-0.5 mt-1">
                    <div className="flex justify-between text-[9px] text-muted-foreground/40">
                      <span>CPU</span><span>—</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground/40">
                      <span>RAM</span><span>—</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground/40">
                      <span>Status</span><span>—</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground/60 text-center mt-5">
            Connect a server to activate live infrastructure monitoring
          </p>
        </div>

        {/* Application Detection Table */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">Applications & Containers</div>
            <span className="text-[10px] text-muted-foreground border border-border rounded px-2 py-0.5">Preview</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/20 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Application</th>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">CPU</th>
                <th className="text-left px-4 py-2.5">RAM</th>
                <th className="text-left px-4 py-2.5">Uptime</th>
              </tr>
            </thead>
            <tbody className="opacity-40">
              {DEMO_APPS.map((app) => (
                <tr key={app.name} className="border-t border-border/30">
                  <td className="px-4 py-3 flex items-center gap-2">
                    <span className="text-lg grayscale">{app.icon}</span>
                    <span className="text-xs text-muted-foreground">{app.name}</span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">{app.type}</td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Logs Section */}
        <div className="glass rounded-2xl p-5">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />Recent Logs
          </div>
          <div className="glass rounded-lg font-mono text-xs h-32 flex items-center justify-center text-muted-foreground/40">
            Logs will stream here after server connection
          </div>
        </div>

        {/* AI Analysis */}
        <div className="glass rounded-2xl p-5 border border-primary/10">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" />AI Analysis
          </div>
          <div className="space-y-2">
            {[
              "Memory usage patterns will be analyzed here",
              "Application stability recommendations",
              "Resource optimization suggestions",
            ].map((msg, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground/50 py-1.5">
                <Zap className="h-3 w-3 text-primary/30 shrink-0 mt-0.5" />
                <span>{msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="glass rounded-2xl p-6 text-center border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent">
          <Rocket className="h-8 w-8 mx-auto text-primary mb-3" />
          <div className="font-semibold">Ready to monitor your infrastructure?</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Connect any Linux server — AWS, DigitalOcean, Hetzner, or self-hosted.
            Unwire AI will detect applications and start monitoring instantly.
          </p>
          <button onClick={onAddServer} className="mt-4 btn-primary-grad px-5 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Connect Server
          </button>
        </div>
      </div>
  );
}

// ─── Add Server Modal ─────────────────────────────────────────────────────

function AddServerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (s: Server) => void;
}) {
  const [form, setForm] = useState<CreateServerPayload>({
    name: "", host: "", provider: "custom", region: "", sshUser: "root", sshPort: 22,
  });
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) return;
    setLoading(true);
    try {
      const server = await createServer(form);
      onCreated(server);
      toast.success("Server connected!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add server.");
    } finally { setLoading(false); }
  }

  const inp = "w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold">Connect a Server</h2>
        <p className="text-sm text-muted-foreground mt-1">Enter your server details to start monitoring.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="text-xs text-muted-foreground block mb-1.5">Server name</span>
              <input className={inp} placeholder="Production Server" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="block col-span-2">
              <span className="text-xs text-muted-foreground block mb-1.5">Host / IP address</span>
              <input className={inp} placeholder="192.168.1.1" value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} required />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Provider</span>
              <select className={inp} value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                {["custom", "aws", "gcp", "azure", "digitalocean", "hetzner"].map((p) => (
                  <option key={p} value={p}>{p === "custom" ? "Custom" : p.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Region</span>
              <input className={inp} placeholder="ap-south-1" value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </label>
          </div>
          <button type="submit" disabled={loading}
            className="w-full btn-primary-grad rounded-md py-2.5 font-medium disabled:opacity-60">
            {loading ? "Connecting…" : "Connect Server"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Server List View (when servers exist) ────────────────────────────────

function ServerListView({ servers, onAddServer }: { servers: Server[]; onAddServer: () => void }) {
  const online = servers.filter(s => s.status === "online").length;
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Servers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{servers.length} server{servers.length !== 1 ? "s" : ""} · {online} online</p>
        </div>
        <button onClick={onAddServer} className="btn-primary-grad px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> Connect Server
        </button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((s) => (
          <Link key={s.id} to="/servers/$serverId" params={{ serverId: s.id }}
            className="glass rounded-xl p-4 hover:bg-secondary/20 transition-colors block">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ServerIcon className="h-4 w-4 text-accent" />
                <span className="font-semibold text-sm">{s.name}</span>
              </div>
              <span className={`h-2 w-2 rounded-full ${s.status === "online" ? "bg-green-400 animate-pulse" : "bg-gray-400"}`} />
            </div>
            <div className="text-xs text-muted-foreground font-mono mb-2">{s.host}</div>
            {s.latestMetric ? (
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>CPU {s.latestMetric.cpuPercent.toFixed(0)}%</span>
                <span>RAM {s.latestMetric.ramPercent.toFixed(0)}%</span>
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/50">No metrics yet</div>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === "online" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                {s.status}
              </span>
              <span className="text-[10px] text-muted-foreground">{s.appCount} apps</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

function ServersPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);

  useEffect(() => {
    fetchServers()
      .then((srvs) => { setServers(srvs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleServerCreated(server: Server) {
    setModal(false);
    fetchServers().then(setServers);
  }

  if (loading) return (
    <AuthGuard>
      <DashboardLayout>
        <div className="h-full flex items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading infrastructure…</span>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );

  // Use shared DashboardLayout — sidebar + center + right panel
  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout rightPanel={<HealthPanel />}>
        {servers.length === 0 ? (
          <CenterDashboard onAddServer={() => setModal(true)} />
        ) : (
          <ServerListView servers={servers} onAddServer={() => setModal(true)} />
        )}
      </DashboardLayout>
      <AddServerModal open={modal} onClose={() => setModal(false)} onCreated={handleServerCreated} />
    </AuthGuard>
  );
}
