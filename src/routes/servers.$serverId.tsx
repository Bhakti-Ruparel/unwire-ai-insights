import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  fetchServerHealth, fetchServerLogs, fetchServerApps,
  fetchServerMetrics, fetchServerDomains, fetchServerSslCerts,
  triggerAppAction, addServerDomain, addServerSslCert,
  deleteServerDomain, askServerQuestion,
} from "@/services/api";
import type {
  Server, ServerApp, ServerLog, ServerDomain, SslCert,
  ServerMetricSnapshot,
} from "@/types/project";
import {
  Loader2, AlertCircle, RefreshCw, ChevronLeft, Server as ServerIcon,
  Play, Square, RotateCcw, Terminal, Globe, ShieldCheck, ShieldAlert,
  MessagesSquare, Send, Cpu, HardDrive, MemoryStick, Plus, X,
  CheckCircle2, Clock, Zap, Activity, Network, Database,
  AlertTriangle, ArrowUpRight, ArrowDownRight, MoreHorizontal,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/servers/$serverId")({
  head: () => ({ meta: [{ title: "Server · Unwire AI" }] }),
  component: ServerDashboard,
});

// ─── App icon mapping ─────────────────────────────────────────────────────

const APP_ICONS: Record<string, { icon: string; color: string }> = {
  n8n:        { icon: "⚙️", color: "text-orange-400" },
  postgresql: { icon: "🐘", color: "text-blue-400" },
  postgres:   { icon: "🐘", color: "text-blue-400" },
  redis:      { icon: "🔴", color: "text-red-400" },
  mongodb:    { icon: "🍃", color: "text-green-400" },
  nginx:      { icon: "🌐", color: "text-green-500" },
  node:       { icon: "🟢", color: "text-green-400" },
  "node.js":  { icon: "🟢", color: "text-green-400" },
  "next.js":  { icon: "▲",  color: "text-foreground" },
  react:      { icon: "⚛️", color: "text-cyan-400" },
  python:     { icon: "🐍", color: "text-yellow-400" },
  docker:     { icon: "🐳", color: "text-blue-400" },
  mysql:      { icon: "🐬", color: "text-blue-300" },
  express:    { icon: "⚡", color: "text-yellow-300" },
};

function getAppIcon(name: string, type: string): { icon: string; color: string } {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(APP_ICONS)) {
    if (key.includes(k)) return v;
  }
  const typeKey = type.toLowerCase();
  for (const [k, v] of Object.entries(APP_ICONS)) {
    if (typeKey.includes(k)) return v;
  }
  return { icon: "📦", color: "text-muted-foreground" };
}

// ─── Status helpers ───────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-400", stopped: "bg-gray-400",
  error: "bg-red-400", restarting: "bg-yellow-400",
};

const STATUS_BADGE: Record<string, string> = {
  online: "bg-green-500/20 text-green-400 border-green-500/30",
  offline: "bg-red-500/20 text-red-400 border-red-500/30",
  degraded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ─── Health Score Ring ────────────────────────────────────────────────────

function HealthScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const status = score >= 75 ? "Healthy" : score >= 50 ? "Warning" : "Critical";
  const msg = score >= 75 ? "Good job! Your server is running well." :
    score >= 50 ? "Some issues detected. Monitor closely." : "Immediate attention needed.";

  return (
    <div className="glass rounded-2xl p-5 flex flex-col items-center gap-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Server Health Score</div>
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-secondary/40" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold" style={{ color }}>{status}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{msg}</div>
      </div>
    </div>
  );
}

// ─── Metric Overview Card ─────────────────────────────────────────────────

function MetricOverviewCard({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
}) {
  const numVal = parseFloat(value);
  const color = numVal > 85 ? "text-red-400" : numVal > 65 ? "text-yellow-400" : "text-foreground";
  return (
    <div className="glass rounded-xl p-4 flex-1 min-w-[140px]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      {/* Mini sparkline placeholder */}
      <div className="mt-2 h-6 flex items-end gap-[2px]">
        {Array.from({ length: 12 }, (_, i) => {
          const h = 20 + Math.random() * 80;
          return <div key={i} className="flex-1 rounded-sm bg-primary/30" style={{ height: `${h}%` }} />;
        })}
      </div>
    </div>
  );
}

// ─── Active Alerts ────────────────────────────────────────────────────────

function ActiveAlerts({ metric, apps }: { metric: ServerMetricSnapshot | null; apps: ServerApp[] }) {
  const alerts: Array<{ level: "warn" | "error"; title: string; desc: string; time: string }> = [];

  if (metric) {
    if (metric.ramPercent > 60) alerts.push({ level: "warn", title: "High Memory Usage", desc: `RAM usage is above ${Math.round(metric.ramPercent)}%`, time: "5m ago" });
    if (metric.diskPercent > 80) alerts.push({ level: "error", title: "Disk Usage Warning", desc: `Disk usage above ${Math.round(metric.diskPercent)}%`, time: "10m ago" });
    if (metric.cpuPercent > 80) alerts.push({ level: "error", title: "High CPU Usage", desc: `CPU at ${Math.round(metric.cpuPercent)}%`, time: "2m ago" });
  }
  const stoppedApps = apps.filter(a => a.status === "error" || a.status === "stopped");
  stoppedApps.forEach(a => alerts.push({ level: "error", title: `${a.name} is ${a.status}`, desc: "Application needs attention", time: "now" }));

  if (alerts.length === 0) return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Alerts</div>
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <CheckCircle2 className="h-4 w-4" />No active alerts
      </div>
    </div>
  );

  return (
    <div className="glass rounded-2xl p-5 border border-yellow-500/20">
      <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-3">Active Alerts ({alerts.length})</div>
      <div className="space-y-3">
        {alerts.slice(0, 4).map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${a.level === "error" ? "text-red-400" : "text-yellow-400"}`} />
            <div className="flex-1">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">{a.desc}</div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Visual Infrastructure Map ────────────────────────────────────────────

function InfrastructureMap({ server, apps }: { server: Server; apps: ServerApp[] }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="text-sm font-semibold mb-6">Running Applications & Services (Visual Map)</div>
      <div className="flex flex-col items-center gap-4">
        {/* Server node */}
        <div className="glass rounded-xl px-5 py-3 border border-primary/30 flex items-center gap-3 shadow-lg shadow-primary/10">
          <ServerIcon className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold text-sm">{server.name}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{server.host}</div>
          </div>
          <span className={`ml-3 text-[10px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[server.status] ?? STATUS_BADGE.unknown}`}>
            {server.status}
          </span>
        </div>

        {/* Connection lines */}
        {apps.length > 0 && (
          <div className="w-0.5 h-6 bg-gradient-to-b from-primary/50 to-primary/20 rounded" />
        )}

        {/* App cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 w-full">
          {apps.map((app) => {
            const { icon, color } = getAppIcon(app.name, app.type);
            const health = app.cpu < 50 && app.memory < 1000 ? "Healthy" : app.cpu > 80 ? "Critical" : "Warning";
            const healthColor = health === "Healthy" ? "text-green-400" : health === "Warning" ? "text-yellow-400" : "text-red-400";
            return (
              <div key={app.id} className="glass rounded-xl p-3 flex flex-col items-center gap-2 hover:bg-secondary/20 transition border border-border/50">
                <div className="text-3xl">{icon}</div>
                <div className="text-xs font-semibold truncate w-full text-center">{app.name}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${app.status === "running" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
                  {app.status === "running" ? "Running" : app.status}
                </span>
                <div className="w-full space-y-1 mt-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-mono">{app.cpu.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">RAM</span>
                    <span className="font-mono">{app.memory > 1024 ? `${(app.memory/1024).toFixed(1)}GB` : `${app.memory.toFixed(0)}MB`}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Status</span>
                    <span className={`font-medium ${healthColor}`}>{health}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Add service button */}
          <div className="glass rounded-xl p-3 flex flex-col items-center justify-center gap-2 border border-dashed border-border/50 hover:border-primary/50 cursor-pointer transition min-h-[140px]">
            <Plus className="h-6 w-6 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Add Service</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Applications Table ───────────────────────────────────────────────────

function ApplicationsTable({ apps, serverId, onRefresh }: { apps: ServerApp[]; serverId: string; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function doAction(appName: string, action: "start" | "stop" | "restart") {
    setBusy(appName);
    try {
      await triggerAppAction(serverId, appName, action);
      toast.success(`${appName} ${action} triggered`);
      setTimeout(onRefresh, 1000);
    } catch { toast.error("Action failed."); }
    finally { setBusy(null); }
  }

  if (apps.length === 0) return (
    <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
      No applications detected. Install the Unwire Agent to start monitoring.
    </div>
  );

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="text-sm font-semibold">Applications & Containers</div>
        <span className="text-xs text-muted-foreground">{apps.filter(a => a.status === "running").length}/{apps.length} running</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Application</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">CPU</th>
              <th className="text-left px-4 py-3">RAM</th>
              <th className="text-left px-4 py-3">Uptime</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => {
              const { icon } = getAppIcon(app.name, app.type);
              return (
                <tr key={app.id} className="border-t border-border hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <div className="font-medium">{app.name}</div>
                        <div className="text-xs text-muted-foreground">{app.port ? `Port ${app.port}` : app.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono">
                      {app.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[app.status] ?? "bg-gray-400"}`} />
                      <span className={`text-xs font-medium ${app.status === "running" ? "text-green-400" : app.status === "error" ? "text-red-400" : "text-gray-400"}`}>
                        {app.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{app.cpu.toFixed(0)}%</td>
                  <td className="px-4 py-3 font-mono text-xs">{app.memory > 1024 ? `${(app.memory/1024).toFixed(1)}GB` : `${app.memory.toFixed(0)}MB`}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{app.uptime || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {app.status === "running" ? (
                        <button disabled={busy === app.name} onClick={() => doAction(app.name, "restart")}
                          className="h-7 w-7 rounded flex items-center justify-center text-yellow-400 hover:bg-yellow-500/10 transition disabled:opacity-40">
                          <RotateCcw className={`h-3.5 w-3.5 ${busy === app.name ? "animate-spin" : ""}`} />
                        </button>
                      ) : (
                        <button disabled={busy === app.name} onClick={() => doAction(app.name, "start")}
                          className="h-7 w-7 rounded flex items-center justify-center text-green-400 hover:bg-green-500/10 transition disabled:opacity-40">
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary/60 transition">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── AI Insight Card ──────────────────────────────────────────────────────

function AIInsightCard({ apps, metric }: { apps: ServerApp[]; metric: ServerMetricSnapshot | null }) {
  const topApp = apps.sort((a, b) => b.memory - a.memory)[0];
  if (!topApp || !metric) return null;

  const ramPct = metric.memoryTotal ? Math.round((topApp.memory / metric.memoryTotal) * 100) : null;

  return (
    <div className="glass rounded-2xl p-5 border border-primary/20">
      <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" />AI Assistant Insight
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        <strong className="text-foreground">{topApp.name}</strong> is using{" "}
        <strong className="text-foreground">{topApp.memory > 1024 ? `${(topApp.memory/1024).toFixed(1)}GB` : `${topApp.memory.toFixed(0)}MB`}</strong> RAM
        {ramPct ? ` (${ramPct}% of total)` : ""}.
        {topApp.memory > 500 && " Consider setting memory limits to prevent potential crashes."}
      </p>
      <button className="mt-3 btn-primary-grad px-3 py-1.5 rounded-md text-xs font-medium">
        Optimize {topApp.name}
      </button>
      <div className="mt-3 text-xs text-primary/70 flex items-center gap-1 cursor-pointer hover:text-primary">
        View all insights →
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────

function ServerDashboard() {
  const { serverId } = useParams({ from: "/servers/$serverId" });

  const [server,  setServer]  = useState<Server | null>(null);
  const [apps,    setApps]    = useState<ServerApp[]>([]);
  const [metric,  setMetric]  = useState<ServerMetricSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const health = await fetchServerHealth(serverId);
      if (!health) { setError("Server not found."); return; }
      setServer(health.server);
      setApps(health.apps);
      setMetric(health.latestMetric);
    } catch { setError("Unable to load server."); }
    finally { setLoading(false); }
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    loadAll();
    pollRef.current = setInterval(loadAll, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <AuthGuard><DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <Loader2 className="h-6 w-6 animate-spin" /><span>Loading server…</span>
      </div>
    </DashboardLayout></AuthGuard>
  );

  if (error || !server) return (
    <AuthGuard><DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error ?? "Server not found."}</span>
        </div>
        <Link to="/servers" className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          ← Back to Servers
        </Link>
      </div>
    </DashboardLayout></AuthGuard>
  );

  const healthScore = server.latestMetric
    ? Math.max(0, Math.min(100, Math.round(100 - Math.max(
        server.latestMetric.cpuPercent,
        server.latestMetric.ramPercent,
        server.latestMetric.diskPercent
      ) * 0.45)))
    : 75;

  return (
    <AuthGuard>
      <DashboardLayout>
        <Toaster theme="dark" position="bottom-right" />

        <main className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link to="/servers" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-2">
                <ChevronLeft className="h-3 w-3" /> Servers
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{server.name}</h1>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${STATUS_BADGE[server.status] ?? STATUS_BADGE.unknown}`}>
                  {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-mono"><Globe className="h-3 w-3" />{server.host}</span>
                {server.provider !== "custom" && <span className="uppercase">{server.provider}</span>}
                {server.region && <span>{server.region}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />Live
              </span>
              <button onClick={loadAll} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-secondary/40 transition">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* ── Main grid: content + sidebar ────────────────────────────── */}
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">

            {/* Left column — main content */}
            <div className="space-y-6 min-w-0">

              {/* Server Overview Cards */}
              <div className="flex flex-wrap gap-3">
                <MetricOverviewCard label="CPU" value={metric ? `${metric.cpuPercent.toFixed(0)}%` : "—"}
                  sub={metric?.cpuCores ? `${metric.cpuCores} cores` : undefined} icon={Cpu} />
                <MetricOverviewCard label="RAM" value={metric ? `${metric.ramPercent.toFixed(0)}%` : "—"}
                  sub={metric?.memoryTotal ? `${(metric.memoryUsed!/1024/1024/1024).toFixed(1)} / ${(metric.memoryTotal/1024/1024/1024).toFixed(1)} GB` : undefined} icon={MemoryStick} />
                <MetricOverviewCard label="Disk" value={metric ? `${metric.diskPercent.toFixed(0)}%` : "—"}
                  sub={metric?.diskTotal ? `${(metric.diskUsed!/1024/1024/1024).toFixed(0)} / ${(metric.diskTotal/1024/1024/1024).toFixed(0)} GB` : undefined} icon={HardDrive} />
                <MetricOverviewCard label="Network" value={metric ? `↑${metric.networkOut.toFixed(1)}` : "—"}
                  sub={metric ? `↓${metric.networkIn.toFixed(1)} Mbps` : undefined} icon={Network} />
                <MetricOverviewCard label="Load Avg" value={metric?.loadAverage?.[0]?.toFixed(2) ?? "—"}
                  sub={metric?.loadAverage ? `1m: ${metric.loadAverage[0]?.toFixed(2)} 5m: ${metric.loadAverage[1]?.toFixed(2) ?? "—"}` : undefined} icon={Activity} />
              </div>

              {/* Visual Infrastructure Map */}
              <InfrastructureMap server={server} apps={apps} />

              {/* Applications Table */}
              <ApplicationsTable apps={apps} serverId={server.id} onRefresh={loadAll} />
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              <HealthScoreRing score={healthScore} />
              <ActiveAlerts metric={metric} apps={apps} />
              <AIInsightCard apps={apps} metric={metric} />
            </div>
          </div>
        </main>
      </DashboardLayout>
    </AuthGuard>
  );
}
