import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { fetchServers, createServer } from "@/services/api";
import type { Server, CreateServerPayload } from "@/types/project";
import {
  Plus, Loader2, Server as ServerIcon, Cpu, MemoryStick,
  Activity, Network, Zap, CheckCircle2, Globe, X, Shield, Terminal,
  ChevronRight, Monitor, HardDrive, Search,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/servers/")({
  head: () => ({ meta: [{ title: "Servers · Unwire AI" }] }),
  component: ServersPage,
});

// ─── Main Page ────────────────────────────────────────────────────────────

function ServersPage() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const loadServers = useCallback(async () => {
    try {
      const srvs = await fetchServers();
      setServers(srvs);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  function handleServerCreated() {
    setModal(false);
    loadServers();
  }

  const filtered = servers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.host.toLowerCase().includes(search.toLowerCase()) ||
    s.provider.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const online = servers.filter((s) => s.status === "online").length;

  if (loading) return (
    <AuthGuard>
      <DashboardLayout>
        <div className="h-full flex items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading servers…</span>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ServerIcon className="h-6 w-6 text-primary" /> Servers
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {servers.length} server{servers.length !== 1 ? "s" : ""} · {online} online
              </p>
            </div>
            <button onClick={() => setModal(true)}
              className="btn-primary-grad px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" /> Add Server
            </button>
          </div>

          {/* Search */}
          {servers.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search servers..."
                  className="w-full pl-9 pr-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Server Grid */}
          {servers.length === 0 ? (
            <EmptyState onAdd={() => setModal(true)} />
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginated.map((s) => (
                  <Link key={s.id} to="/servers/$serverId" params={{ serverId: s.id }}
                    className="glass rounded-xl p-4 hover:bg-secondary/20 transition-colors block border border-border/30 hover:border-primary/30 group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                          <ServerIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold text-sm block">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{s.host}</span>
                        </div>
                      </div>
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        s.status === "online" ? "bg-green-400 animate-pulse" : "bg-gray-400"
                      }`} />
                    </div>

                    {/* Provider tag */}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3">
                      {s.provider !== "custom" ? (
                        <span className="px-1.5 py-0.5 rounded bg-secondary/50 uppercase font-medium">{s.provider}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Custom</span>
                      )}
                      {s.region && <span>{s.region}</span>}
                      <span>{s.appCount} apps</span>
                    </div>

                    {/* Metrics */}
                    {s.latestMetric ? (
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="glass rounded px-2 py-1.5 text-center">
                          <div className="text-muted-foreground">CPU</div>
                          <div className={`font-mono font-bold ${s.latestMetric.cpuPercent > 80 ? "text-red-400" : "text-foreground"}`}>
                            {s.latestMetric.cpuPercent.toFixed(0)}%
                          </div>
                        </div>
                        <div className="glass rounded px-2 py-1.5 text-center">
                          <div className="text-muted-foreground">RAM</div>
                          <div className={`font-mono font-bold ${s.latestMetric.ramPercent > 80 ? "text-red-400" : "text-foreground"}`}>
                            {s.latestMetric.ramPercent.toFixed(0)}%
                          </div>
                        </div>
                        <div className="glass rounded px-2 py-1.5 text-center">
                          <div className="text-muted-foreground">Disk</div>
                          <div className={`font-mono font-bold ${s.latestMetric.diskPercent > 80 ? "text-red-400" : "text-foreground"}`}>
                            {s.latestMetric.diskPercent.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground/50 py-1">Waiting for agent data...</div>
                    )}

                    {/* Status bar */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        s.status === "online" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                      }`}>{s.status}</span>
                      <span className="text-[10px] text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                        Open <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg glass text-xs disabled:opacity-40">
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg glass text-xs disabled:opacity-40">
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Add Server Modal */}
        {modal && (
          <AddServerModal open={modal} onClose={() => setModal(false)} onCreated={handleServerCreated} />
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass rounded-2xl p-10 text-center border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent">
      <ServerIcon className="h-12 w-12 mx-auto text-primary/60 mb-4" />
      <h2 className="text-lg font-semibold">No servers connected yet</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Add your first server to start monitoring. Connect any Linux server — AWS,
        DigitalOcean, Hetzner, or self-hosted VPS.
      </p>
      <div className="flex items-center justify-center gap-3 mt-6">
        <button onClick={onAdd}
          className="btn-primary-grad px-5 py-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Server
        </button>
        <Link to="/infrastructure"
          className="px-5 py-2.5 rounded-lg glass text-sm font-medium inline-flex items-center gap-2 hover:bg-secondary/60">
          <Globe className="h-4 w-4" /> View Infrastructure
        </Link>
      </div>
    </div>
  );
}

// ─── Add Server Modal ─────────────────────────────────────────────────────

function AddServerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [step, setStep] = useState<"form" | "token">("form");
  const [form, setForm] = useState<CreateServerPayload & { os?: string; serverType?: string }>({
    name: "", host: "", provider: "custom", region: "", sshUser: "root", sshPort: 22,
    os: "Ubuntu 22.04", serverType: "vps",
  });
  const [loading, setLoading] = useState(false);
  const [createdServer, setCreatedServer] = useState<any>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) {
      toast.error("Server name and IP address are required.");
      return;
    }
    setLoading(true);
    try {
      const server = await createServer({
        name: form.name, host: form.host, provider: form.provider,
        region: form.region, sshUser: form.sshUser, sshPort: form.sshPort,
      });
      setCreatedServer(server);
      setStep("token");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add server.");
    } finally { setLoading(false); }
  }

  function handleDone() {
    onCreated();
    setStep("form");
    setCreatedServer(null);
  }

  const inp = "w-full bg-secondary/40 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong rounded-2xl w-full max-w-lg p-6 relative border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        {step === "form" ? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <ServerIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Add Server</h2>
                <p className="text-xs text-muted-foreground">Add any server — cloud, VPS, dedicated, or local</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block col-span-2">
                  <span className="text-xs text-muted-foreground block mb-1.5">Server Name *</span>
                  <input className={inp} placeholder="Production Server" value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs text-muted-foreground block mb-1.5">IP Address / Hostname *</span>
                  <input className={inp} placeholder="142.93.101.45" value={form.host}
                    onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} required />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-1.5">Provider</span>
                  <select className={inp} value={form.provider}
                    onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                    {[
                      { value: "custom", label: "Custom / Self-hosted" },
                      { value: "aws", label: "AWS" }, { value: "gcp", label: "GCP" },
                      { value: "azure", label: "Azure" }, { value: "digitalocean", label: "DigitalOcean" },
                      { value: "hetzner", label: "Hetzner" }, { value: "linode", label: "Linode" },
                      { value: "vultr", label: "Vultr" }, { value: "other", label: "Other" },
                    ].map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-1.5">Region</span>
                  <input className={inp} placeholder="us-east-1" value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
                </label>
              </div>

              {/* Connection method info */}
              <div className="glass rounded-lg p-3 border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Connection: Agent Token</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  After adding, you'll receive a unique agent token. Install the Unwire AI agent to start
                  monitoring CPU, RAM, Disk, Network, services, containers, and logs.
                </p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full btn-primary-grad rounded-lg py-2.5 font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {loading ? "Adding Server..." : "Add Server"}
              </button>
            </form>
          </>
        ) : (
          <AgentTokenStep server={createdServer} onDone={handleDone} />
        )}
      </div>
    </div>
  );
}

// ─── Agent Token Step ─────────────────────────────────────────────────────

function AgentTokenStep({ server, onDone }: { server: any; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"waiting" | "connected">("waiting");
  const [platform, setPlatform] = useState<"linux" | "windows" | "docker">("linux");
  const token = server?.agentToken ?? server?.agentTokenMasked ?? "—";
  const serverUrl = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:5000";

  // Poll for connection
  useEffect(() => {
    if (!server?.id) return;
    let active = true;
    const poll = async () => {
      try {
        const health = await fetchServers();
        const found = health.find((s: any) => s.id === server.id);
        if (found && found.status === "online" && active) {
          setConnectionStatus("connected");
          return true;
        }
      } catch {}
      return false;
    };
    const interval = setInterval(async () => {
      if (await poll()) clearInterval(interval);
    }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [server?.id]);

  function copyToken() {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Token copied!");
  }

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd);
    toast.success("Command copied!");
  }

  const linuxCmd = `curl -fsSL https://get.unwire.ai/agent | bash && unwire-agent configure --token ${token} --server ${serverUrl} && unwire-agent start`;
  const windowsCmd = `Invoke-WebRequest -Uri "https://get.unwire.ai/agent/windows" -OutFile unwire-agent.exe; .\\unwire-agent.exe configure --token ${token} --server ${serverUrl}; .\\unwire-agent.exe start`;
  const dockerCmd = `docker run -d --name unwire-agent --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock -e AGENT_TOKEN=${token} -e SERVER_URL=${serverUrl} unwireai/agent:latest`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
          connectionStatus === "connected" ? "bg-green-500/10 border border-green-500/30" : "bg-primary/10 border border-primary/30"
        }`}>
          {connectionStatus === "connected" ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <ServerIcon className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{connectionStatus === "connected" ? "Server Connected!" : "Install Agent"}</h2>
          <p className="text-xs text-muted-foreground">
            {connectionStatus === "connected" ? "Agent is reporting data." : "Install the agent to start monitoring"}
          </p>
        </div>
      </div>

      {/* Connection badge */}
      <div className={`glass rounded-lg p-3 border flex items-center gap-3 ${
        connectionStatus === "connected" ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/20 bg-yellow-500/5"
      }`}>
        {connectionStatus === "waiting" ? (
          <><Loader2 className="h-4 w-4 animate-spin text-yellow-400" /><div><div className="text-xs font-medium text-yellow-400">Waiting for connection...</div><div className="text-[10px] text-muted-foreground">Updates automatically when agent connects.</div></div></>
        ) : (
          <><CheckCircle2 className="h-4 w-4 text-green-400" /><div><div className="text-xs font-medium text-green-400">Agent Connected</div><div className="text-[10px] text-muted-foreground">Receiving data.</div></div></>
        )}
      </div>

      {/* Token */}
      <div className="glass rounded-lg p-4 border border-primary/20">
        <div className="text-xs font-medium text-primary mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Agent Token</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-secondary/50 px-3 py-2 rounded border border-border truncate">{token}</code>
          <button onClick={copyToken} className="px-3 py-2 rounded-lg glass text-xs font-medium hover:bg-secondary/60 shrink-0">{copied ? "Copied!" : "Copy"}</button>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="flex border-b border-border">
          {(["linux", "windows", "docker"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`flex-1 px-3 py-2 text-xs font-medium transition ${platform === p ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {p === "linux" ? "🐧 Linux" : p === "windows" ? "🪟 Windows" : "🐳 Docker"}
            </button>
          ))}
        </div>
        <div className="p-3 relative">
          <pre className="bg-secondary/50 rounded-lg p-3 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">{
            platform === "linux" ? linuxCmd : platform === "windows" ? windowsCmd : dockerCmd
          }</pre>
          <button onClick={() => copyCmd(platform === "linux" ? linuxCmd : platform === "windows" ? windowsCmd : dockerCmd)}
            className="absolute top-5 right-5 px-2 py-1 rounded glass text-[10px]">Copy</button>
        </div>
      </div>

      <button onClick={onDone} className="w-full btn-primary-grad rounded-lg py-2.5 font-medium">
        {connectionStatus === "connected" ? "View Server →" : "Done"}
      </button>
    </div>
  );
}
