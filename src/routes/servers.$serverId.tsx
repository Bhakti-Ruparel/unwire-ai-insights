import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  fetchServerHealth, fetchServerLogs, fetchServerApps,
  fetchServerDomains, fetchServerSslCerts, triggerAppAction,
  addServerDomain, addServerSslCert, deleteServerDomain,
  askServerQuestion,
} from "@/services/api";
import type {
  Server, ServerApp, ServerLog, ServerDomain, SslCert, ServerAIAnswer,
} from "@/types/project";
import {
  Loader2, AlertCircle, RefreshCw, ChevronLeft, Server as ServerIcon,
  Play, Square, RotateCcw, Terminal, Globe, ShieldCheck, ShieldAlert,
  MessagesSquare, Send, Cpu, HardDrive, MemoryStick, Plus, X,
  CheckCircle2, Clock, Zap,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/servers/$serverId")({
  head: () => ({ meta: [{ title: "Server · Unwire AI" }] }),
  component: ServerDashboard,
});

// ─── Helpers ─────────────────────────────────────────────────────────────

const APP_STATUS_CONFIG = {
  running:    { dot: "bg-green-400",  label: "Running",    text: "text-green-400"  },
  stopped:    { dot: "bg-gray-400",   label: "Stopped",    text: "text-gray-400"   },
  error:      { dot: "bg-red-400",    label: "Error",      text: "text-red-400"    },
  restarting: { dot: "bg-yellow-400", label: "Restarting", text: "text-yellow-400" },
} as const;

const LOG_LEVEL_CONFIG = {
  info:  "text-blue-400",
  warn:  "text-yellow-400",
  error: "text-red-400",
  debug: "text-gray-400",
};

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = value > 85 ? "text-red-400" : value > 65 ? "text-yellow-400" : "text-green-400";
  const barColor = value > 85 ? "bg-red-500" : value > 65 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value.toFixed(0)}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-secondary/60">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── App row ─────────────────────────────────────────────────────────────

function AppRow({ app, serverId, onAction }: {
  app: ServerApp;
  serverId: string;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const cfg = APP_STATUS_CONFIG[app.status] ?? APP_STATUS_CONFIG.stopped;

  async function doAction(action: "start" | "stop" | "restart") {
    setBusy(true);
    try {
      await triggerAppAction(serverId, app.name, action);
      toast.success(`${app.name} ${action} triggered`);
      setTimeout(onAction, 1000);
    } catch { toast.error("Action failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-secondary/10 transition-colors">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{app.name}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {app.type}{app.port ? ` · :${app.port}` : ""}{app.pid ? ` · PID ${app.pid}` : ""}
          </div>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground font-mono">
        {app.uptime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{app.uptime}</span>}
        {app.memory > 0 && <span>{app.memory.toFixed(0)}MB</span>}
        {app.cpu > 0 && <span>{app.cpu.toFixed(1)}%cpu</span>}
      </div>
      <span className={`text-xs font-medium hidden sm:block ${cfg.text}`}>{cfg.label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {app.status !== "running" && (
          <button disabled={busy} onClick={() => doAction("start")}
            className="h-7 w-7 rounded flex items-center justify-center text-green-400 hover:bg-green-500/10 transition disabled:opacity-40" title="Start">
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        {app.status === "running" && (
          <button disabled={busy} onClick={() => doAction("stop")}
            className="h-7 w-7 rounded flex items-center justify-center text-red-400 hover:bg-red-500/10 transition disabled:opacity-40" title="Stop">
            <Square className="h-3.5 w-3.5" />
          </button>
        )}
        <button disabled={busy} onClick={() => doAction("restart")}
          className="h-7 w-7 rounded flex items-center justify-center text-yellow-400 hover:bg-yellow-500/10 transition disabled:opacity-40" title="Restart">
          <RotateCcw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}

// ─── Log stream ──────────────────────────────────────────────────────────

function LogStream({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [filter, setFilter] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchServerLogs(serverId, { limit: 150 }).then(setLogs);
  }, [serverId]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const filtered = filter ? logs.filter((l) => l.level === filter || l.appName === filter) : logs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <Terminal className="h-4 w-4 text-accent" />Logs
        </div>
        <div className="flex gap-1.5">
          {["", "error", "warn", "info"].map((lvl) => (
            <button key={lvl} onClick={() => setFilter(lvl)}
              className={`text-xs px-2 py-0.5 rounded border transition ${filter === lvl ? "bg-secondary/60 border-border" : "border-transparent text-muted-foreground"}`}>
              {lvl || "All"}
            </button>
          ))}
        </div>
      </div>
      <div className="glass rounded-xl font-mono text-xs h-64 overflow-y-auto p-3 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">No logs available</div>
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="flex gap-2 leading-5">
              <span className="text-muted-foreground shrink-0">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 w-12 ${LOG_LEVEL_CONFIG[l.level] ?? "text-gray-400"}`}>
                [{l.level.toUpperCase()}]
              </span>
              {l.appName && <span className="text-accent shrink-0">{l.appName}:</span>}
              <span className="text-foreground/80 break-all">{l.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── AI panel ────────────────────────────────────────────────────────────

function ServerAIPanel({ serverId }: { serverId: string }) {
  const [msgs, setMsgs]   = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy]   = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const SUGGESTIONS = [
    "Why did my backend restart?",
    "Is the server healthy?",
    "What errors occurred recently?",
    "Is CPU usage normal?",
  ];

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await askServerQuestion(serverId, q);
      setMsgs((m) => [...m, { role: "ai", text: res.answer }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Unable to get AI answer. Check backend connection." }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="glass rounded-2xl flex flex-col h-96">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <MessagesSquare className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">AI Assistant</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Powered by server context</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {msgs.length === 0 ? (
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">Ask me anything about this server:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg glass border border-border/50 hover:bg-secondary/40 transition">
                {s}
              </button>
            ))}
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-secondary/50 border border-border rounded-tl-sm"
              }`}>
                {m.text}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs pl-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="shrink-0 px-3 pb-3 pt-2 border-t border-border flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about logs, CPU, errors…"
          className="flex-1 bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition" />
        <button type="submit" disabled={!input.trim() || busy}
          className="btn-primary-grad rounded-lg h-9 w-9 flex items-center justify-center shrink-0 disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

// ─── Domains & SSL section ────────────────────────────────────────────────

function DomainsSection({ serverId }: { serverId: string }) {
  const [domains, setDomains] = useState<ServerDomain[]>([]);
  const [certs,   setCerts]   = useState<SslCert[]>([]);
  const [adding,  setAdding]  = useState<"domain" | "ssl" | null>(null);
  const [form, setForm] = useState({ domain: "", type: "A", target: "" });

  useEffect(() => {
    fetchServerDomains(serverId).then(setDomains);
    fetchServerSslCerts(serverId).then(setCerts);
  }, [serverId]);

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await addServerDomain(serverId, form);
      setDomains((prev) => [...prev, d]);
      setAdding(null);
      setForm({ domain: "", type: "A", target: "" });
      toast.success("Domain added");
    } catch { toast.error("Failed to add domain."); }
  }

  async function handleAddSsl(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await addServerSslCert(serverId, { domain: form.domain });
      setCerts((prev) => [...prev, c]);
      setAdding(null);
      setForm({ domain: "", type: "A", target: "" });
      toast.success("SSL cert provisioning started");
    } catch { toast.error("Failed to add SSL cert."); }
  }

  const inp = "bg-secondary/40 border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary transition flex-1";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Domains */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent" />Domains
          </div>
          <button onClick={() => setAdding("domain")} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" />Add
          </button>
        </div>
        {adding === "domain" && (
          <form onSubmit={handleAddDomain} className="glass rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <input className={inp} placeholder="api.example.com" value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} required />
              <select className="bg-secondary/40 border border-border rounded-md px-2 text-sm"
                value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {["A", "CNAME", "AAAA"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <input className={inp + " w-full"} placeholder="Target (IP or hostname)" value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} required />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary-grad px-3 py-1.5 rounded text-sm">Add</button>
              <button type="button" onClick={() => setAdding(null)} className="text-sm text-muted-foreground">Cancel</button>
            </div>
          </form>
        )}
        <div className="glass rounded-xl overflow-hidden">
          {domains.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No domains configured</div>
          ) : (
            domains.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate">{d.domain}</div>
                  <div className="text-xs text-muted-foreground">{d.type} → {d.target}</div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${d.status === "active" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-muted-foreground border-border"}`}>
                  {d.status}
                </span>
                <button onClick={async () => { await deleteServerDomain(serverId, d.id); setDomains((p) => p.filter((x) => x.id !== d.id)); }}
                  className="text-muted-foreground hover:text-destructive transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* SSL */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />SSL Certificates
          </div>
          <button onClick={() => setAdding("ssl")} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" />Add
          </button>
        </div>
        {adding === "ssl" && (
          <form onSubmit={handleAddSsl} className="glass rounded-xl p-3 space-y-2">
            <input className={inp + " w-full"} placeholder="api.example.com" value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} required />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary-grad px-3 py-1.5 rounded text-sm">Provision</button>
              <button type="button" onClick={() => setAdding(null)} className="text-sm text-muted-foreground">Cancel</button>
            </div>
          </form>
        )}
        <div className="glass rounded-xl overflow-hidden">
          {certs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No SSL certificates</div>
          ) : (
            certs.map((c) => {
              const expiring = c.daysUntilExpiry !== null && c.daysUntilExpiry < 30;
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
                  {c.status === "active" && !expiring
                    ? <ShieldCheck className="h-4 w-4 text-green-400 shrink-0" />
                    : <ShieldAlert className="h-4 w-4 text-yellow-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">{c.domain}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.provider} · {c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString()}` : "Pending"}
                      {c.daysUntilExpiry !== null && ` · ${c.daysUntilExpiry}d left`}
                    </div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    c.status === "active" && !expiring ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : expiring ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                    : "text-muted-foreground border-border"}`}>
                    {expiring ? "Expiring" : c.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────

function ServerDashboard() {
  const { serverId } = useParams({ from: "/servers/$serverId" });

  const [server, setServer] = useState<Server | null>(null);
  const [apps,   setApps]   = useState<ServerApp[]>([]);
  const [metric, setMetric] = useState<{ cpuPercent: number; ramPercent: number; diskPercent: number; networkIn: number; networkOut: number } | null>(null);
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
    pollRef.current = setInterval(loadAll, 10000); // refresh every 10s
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll]);

  if (loading) return (
    <div className="min-h-screen"><AppHeader />
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <Loader2 className="h-6 w-6 animate-spin" /><span>Loading server…</span>
      </div>
    </div>
  );

  if (error || !server) return (
    <div className="min-h-screen"><AppHeader />
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error ?? "Server not found."}</span>
        </div>
      </div>
    </div>
  );

  const statusColor = { online: "text-green-400", offline: "text-red-400", degraded: "text-yellow-400", unknown: "text-gray-400" };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/servers" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-2">
              <ChevronLeft className="h-3 w-3" /> All servers
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-secondary/60 border border-border flex items-center justify-center">
                <ServerIcon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">{server.name}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                  <span className="font-mono">{server.host}</span>
                  {server.region && <span>{server.region}</span>}
                  <span className={`font-medium ${statusColor[server.status] ?? statusColor.unknown}`}>
                    ● {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-border hover:bg-secondary/30 transition">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>

        {/* Metrics */}
        {metric ? (
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="CPU"  value={metric.cpuPercent}  icon={Cpu}         />
            <MetricCard label="RAM"  value={metric.ramPercent}  icon={MemoryStick} />
            <MetricCard label="Disk" value={metric.diskPercent} icon={HardDrive}   />
          </div>
        ) : (
          <div className="glass rounded-xl p-4 text-center text-sm text-muted-foreground">
            No live metrics — install the Unwire Agent on your server to start monitoring.
            <div className="mt-2 font-mono text-xs bg-secondary/40 rounded px-3 py-2 inline-block">
              curl -sSL https://get.unwire.ai/agent | bash -s {server.id}
            </div>
          </div>
        )}

        {/* Applications */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              Applications ({apps.length})
            </div>
            <div className="text-xs text-muted-foreground">
              {apps.filter(a => a.status === "running").length} running
            </div>
          </div>
          {apps.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No applications registered. Deploy a project to this server to see apps here.
            </div>
          ) : (
            apps.map((app) => (
              <AppRow key={app.id} app={app} serverId={server.id} onAction={loadAll} />
            ))
          )}
        </div>

        {/* Logs + AI side by side */}
        <div className="grid lg:grid-cols-2 gap-6">
          <LogStream serverId={server.id} />
          <ServerAIPanel serverId={server.id} />
        </div>

        {/* Domains & SSL */}
        <DomainsSection serverId={server.id} />
      </main>
    </div>
  );
}
