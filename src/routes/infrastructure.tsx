import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  fetchInfraProviders, fetchInfraConnections, fetchInfraResources,
  connectInfraProvider, disconnectInfraProvider, syncInfraConnection,
  fetchServers, createServer, fetchServerHealth,
  type InfraProvider, type InfraConnection, type CloudResourceItem,
} from "@/services/api";
import type { Server, CreateServerPayload } from "@/types/project";
import {
  Cloud, Plus, RefreshCw, Loader2, CheckCircle2, XCircle,
  Server as ServerIcon, Container, Database, Network, HardDrive, Cpu, MemoryStick,
  Trash2, Zap, Globe, ExternalLink, X, Shield, Terminal, ChevronRight,
  Monitor, AlertTriangle,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/infrastructure")({
  head: () => ({ meta: [{ title: "Infrastructure · Unwire AI" }] }),
  component: InfrastructurePage,
});

// ─── Provider Icons ───────────────────────────────────────────────────────

const PROVIDER_LOGOS: Record<string, { icon: string; color: string; bg: string }> = {
  aws:          { icon: "☁️", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  azure:        { icon: "☁️", color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
  gcp:          { icon: "☁️", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
  digitalocean: { icon: "🌊", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
  docker:       { icon: "🐳", color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/30" },
  hetzner:      { icon: "🔴", color: "text-rose-400",   bg: "bg-rose-500/10 border-rose-500/30" },
};

function ProviderIcon({ type, size = 20 }: { type: string; size?: number }) {
  const colors: Record<string, string> = {
    aws: "text-orange-400", digitalocean: "text-blue-400", azure: "text-sky-400",
    gcp: "text-red-400", hetzner: "text-rose-400", docker: "text-cyan-400",
  };
  const cls = size <= 14 ? "h-3.5 w-3.5" : "h-5 w-5";
  return <Cloud className={`${cls} ${colors[type] ?? "text-muted-foreground"}`} />;
}

function ResourceIcon({ type }: { type: string }) {
  switch (type) {
    case "instance": return <ServerIcon className="h-5 w-5 text-primary shrink-0" />;
    case "container": return <Container className="h-5 w-5 text-cyan-400 shrink-0" />;
    case "database": return <Database className="h-5 w-5 text-yellow-400 shrink-0" />;
    case "volume": return <HardDrive className="h-5 w-5 text-purple-400 shrink-0" />;
    case "network": return <Network className="h-5 w-5 text-green-400 shrink-0" />;
    default: return <Cloud className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────

function InfrastructurePage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<InfraProvider[]>([]);
  const [connections, setConnections] = useState<InfraConnection[]>([]);
  const [resources, setResources] = useState<CloudResourceItem[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<InfraProvider | null>(null);
  const [addServerModal, setAddServerModal] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [connName, setConnName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, c, r, s] = await Promise.all([
      fetchInfraProviders(), fetchInfraConnections(),
      fetchInfraResources({ limit: 50 }),
      fetchServers(),
    ]);
    setProviders(p); setConnections(c);
    setResources(r.resources); setCursor(r.nextCursor);
    setServers(s);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function loadMoreResources() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const r = await fetchInfraResources({ limit: 50 });
    setResources((prev) => [...prev, ...r.resources]);
    setCursor(r.nextCursor);
    setLoadingMore(false);
  }

  async function handleConnect() {
    if (!connectModal || !connName.trim()) return;
    setSubmitting(true); setError("");
    try {
      await connectInfraProvider(connectModal.type, connName.trim(), formData);
      setConnectModal(null); setFormData({}); setConnName("");
      toast.success("Provider connected!");
      loadAll();
    } catch (e: any) { setError(e.message ?? "Connection failed."); }
    setSubmitting(false);
  }

  async function handleDisconnect(id: string) {
    await disconnectInfraProvider(id);
    toast.success("Provider disconnected.");
    loadAll();
  }

  async function handleSync(id: string) {
    toast.info("Syncing resources...");
    await syncInfraConnection(id);
    toast.success("Sync complete!");
    loadAll();
  }

  function getConnForProvider(type: string) {
    return connections.find((c) => c.provider === type && c.status !== "disconnected");
  }

  function handleOpenServer(serverId: string) {
    navigate({ to: "/servers/$serverId", params: { serverId } });
  }

  // Group resources by provider
  const resourcesByProvider = resources.reduce<Record<string, CloudResourceItem[]>>((acc, r) => {
    if (!acc[r.provider]) acc[r.provider] = [];
    acc[r.provider].push(r);
    return acc;
  }, {});

  // Filter compute resources (instances/containers)
  const computeResources = resources.filter(
    (r) => r.resourceType === "instance" || r.resourceType === "container"
  );

  const filteredResources = resourceFilter === "all"
    ? resources
    : resources.filter((r) => r.provider === resourceFilter);

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-[1300px] mx-auto px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Cloud className="h-6 w-6 text-primary" /> Infrastructure
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Multi-cloud resource discovery & server inventory
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {connections.filter(c => c.status === "connected").length} providers · {resources.length} resources · {servers.length} servers
              </span>
              <button onClick={() => setAddServerModal(true)}
                className="btn-primary-grad px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4" /> Add Server
              </button>
            </div>
          </div>

          {/* Provider Cards */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Cloud Providers
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {providers.map((p) => {
                const conn = getConnForProvider(p.type);
                return (
                  <ProviderCard key={p.type} provider={p} connection={conn}
                    onConnect={() => { setConnectModal(p); setFormData({}); setConnName(`${p.displayName} Account`); }}
                    onSync={conn ? () => handleSync(conn.id) : undefined}
                    onDisconnect={conn ? () => handleDisconnect(conn.id) : undefined}
                  />
                );
              })}
            </div>
          </div>

          {/* Custom Servers Section */}
          {servers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Managed Servers ({servers.length})
                </h2>
                <button onClick={() => setAddServerModal(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add Server
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {servers.map((s) => (
                  <ServerResourceCard key={s.id} server={s} onOpen={() => handleOpenServer(s.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Discovered Cloud Resources */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : resources.length === 0 && servers.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Cloud className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No resources discovered yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect a cloud provider or add a custom server to get started.
              </p>
              <button onClick={() => setAddServerModal(true)}
                className="mt-4 btn-primary-grad px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Add Server
              </button>
            </div>
          ) : resources.length > 0 && (
            <div>
              {/* Filter bar */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Discovered Resources ({filteredResources.length})
                </h2>
                <div className="flex items-center gap-2">
                  <select value={resourceFilter}
                    onChange={(e) => setResourceFilter(e.target.value)}
                    className="text-xs bg-secondary/50 border border-border rounded-md px-2 py-1.5 outline-none">
                    <option value="all">All Providers</option>
                    {Object.keys(resourcesByProvider).map((p) => (
                      <option key={p} value={p}>{p.toUpperCase()}</option>
                    ))}
                  </select>
                  <button onClick={loadAll}
                    className="h-7 w-7 rounded-md glass flex items-center justify-center hover:bg-secondary/60">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Resource grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredResources.map((r) => (
                  <CloudResourceCard key={r.id} resource={r}
                    onOpenServer={r.resourceType === "instance" || r.resourceType === "container"
                      ? () => {
                          // Find matching server by resource name/IP
                          const match = servers.find(
                            (s) => s.name === r.name || s.host === (r.specs?.ipAddress ?? "")
                          );
                          if (match) handleOpenServer(match.id);
                          else toast.info("Navigate to Servers page to connect this resource.");
                        }
                      : undefined}
                  />
                ))}
              </div>

              {/* Load more */}
              {cursor && (
                <div className="text-center pt-4">
                  <button onClick={loadMoreResources} disabled={loadingMore}
                    className="text-xs text-primary hover:underline disabled:opacity-50">
                    {loadingMore ? "Loading..." : "Load more resources"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {connectModal && (
          <ConnectModal provider={connectModal} connName={connName} setConnName={setConnName}
            formData={formData} setFormData={setFormData} error={error}
            submitting={submitting} onSubmit={handleConnect}
            onClose={() => { setConnectModal(null); setError(""); }} />
        )}
        {addServerModal && (
          <AddServerModal
            open={addServerModal}
            onClose={() => setAddServerModal(false)}
            onCreated={(s) => {
              setAddServerModal(false);
              loadAll();
              toast.success("Server added! Use the agent token to connect.");
            }}
          />
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────

function ProviderCard({ provider, connection, onConnect, onSync, onDisconnect }: {
  provider: InfraProvider; connection?: InfraConnection;
  onConnect: () => void; onSync?: () => void; onDisconnect?: () => void;
}) {
  const connected = connection && connection.status === "connected";
  const hasError = connection?.status === "error";
  const logo = PROVIDER_LOGOS[provider.type];

  return (
    <div className={`glass rounded-xl p-4 border transition hover:shadow-lg ${
      connected ? "border-green-500/30" : hasError ? "border-red-500/30" : "border-border/40"
    }`}>
      <div className="flex flex-col items-center text-center gap-2">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-xl border ${logo?.bg ?? "bg-secondary/30 border-border/50"}`}>
          {logo?.icon ?? "☁️"}
        </div>
        <span className="text-xs font-semibold">{provider.displayName}</span>
        {connected && (
          <>
            <span className="text-[10px] text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Connected
            </span>
            <span className="text-[10px] text-muted-foreground">
              {connection.resourceCount} resources
            </span>
            <div className="flex gap-1 mt-1">
              {onSync && (
                <button onClick={onSync} title="Sync"
                  className="text-[10px] px-2 py-0.5 rounded glass hover:bg-secondary/60">
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
              {onDisconnect && (
                <button onClick={onDisconnect} title="Disconnect"
                  className="text-[10px] px-2 py-0.5 rounded glass text-red-400 hover:bg-red-500/10">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </>
        )}
        {hasError && (
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Error
          </span>
        )}
        {!connection && (
          <button onClick={onConnect}
            className="mt-1 text-[10px] px-3 py-1 rounded-lg btn-primary-grad font-medium flex items-center gap-1">
            <Plus className="h-3 w-3" /> Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Server Resource Card (for managed servers) ───────────────────────────

function ServerResourceCard({ server, onOpen }: { server: Server; onOpen: () => void }) {
  const statusColor = server.status === "online" ? "text-green-400" : server.status === "offline" ? "text-red-400" : "text-yellow-400";
  const statusDot = server.status === "online" ? "bg-green-400" : server.status === "offline" ? "bg-red-400" : "bg-yellow-400";
  const agentBadge = server.status === "online" ? "Agent Connected" : server.status === "unknown" ? "Awaiting Agent" : "Agent Offline";

  return (
    <div className="glass rounded-xl p-4 border border-border/40 hover:border-primary/30 transition group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <ServerIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">{server.name}</div>
            <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
              <Globe className="h-2.5 w-2.5" /> {server.host}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`flex items-center gap-1 text-[10px] ${statusColor}`}>
            <span className={`h-2 w-2 rounded-full ${statusDot} ${server.status === "online" ? "animate-pulse" : ""}`} />
            {server.status}
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
            server.status === "online" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
            server.status === "unknown" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
            "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>{agentBadge}</span>
        </div>
      </div>

      {/* Provider & Region */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        {server.provider !== "custom" && (
          <span className="px-1.5 py-0.5 rounded bg-secondary/50 uppercase font-medium">
            {server.provider}
          </span>
        )}
        {server.provider === "custom" && (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
            Custom
          </span>
        )}
        {server.region && <span>{server.region}</span>}
        <span>{server.appCount} apps</span>
      </div>

      {/* Metrics */}
      {server.latestMetric && (
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
          <div className="glass rounded px-2 py-1 text-center">
            <div className="text-muted-foreground">CPU</div>
            <div className={`font-mono font-bold ${server.latestMetric.cpuPercent > 80 ? "text-red-400" : ""}`}>
              {server.latestMetric.cpuPercent.toFixed(0)}%
            </div>
          </div>
          <div className="glass rounded px-2 py-1 text-center">
            <div className="text-muted-foreground">RAM</div>
            <div className={`font-mono font-bold ${server.latestMetric.ramPercent > 80 ? "text-red-400" : ""}`}>
              {server.latestMetric.ramPercent.toFixed(0)}%
            </div>
          </div>
          <div className="glass rounded px-2 py-1 text-center">
            <div className="text-muted-foreground">Disk</div>
            <div className={`font-mono font-bold ${server.latestMetric.diskPercent > 80 ? "text-red-400" : ""}`}>
              {server.latestMetric.diskPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {!server.latestMetric && server.status === "unknown" && (
        <div className="mt-3 text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Waiting for agent data...
        </div>
      )}

      {/* Open Server Button */}
      <button onClick={onOpen}
        className="mt-3 w-full text-xs px-3 py-2 rounded-lg glass border border-border/50 hover:border-primary/50 hover:bg-primary/5 font-medium flex items-center justify-center gap-1.5 transition opacity-80 group-hover:opacity-100">
        <Monitor className="h-3 w-3" /> Open Server
        <ChevronRight className="h-3 w-3 ml-auto" />
      </button>
    </div>
  );
}

// ─── Cloud Resource Card ──────────────────────────────────────────────────

function CloudResourceCard({ resource, onOpenServer }: {
  resource: CloudResourceItem; onOpenServer?: () => void;
}) {
  const specs = resource.specs ?? {};
  const metrics = resource.metrics ?? {};
  const statusColor = resource.status === "running" ? "text-green-400" : resource.status === "stopped" ? "text-yellow-400" : "text-red-400";
  const statusDot = resource.status === "running" ? "bg-green-400" : resource.status === "stopped" ? "bg-yellow-400" : "bg-red-400";
  const isCompute = resource.resourceType === "instance" || resource.resourceType === "container";

  return (
    <div className="glass rounded-xl p-4 border border-border/40 hover:border-primary/30 transition group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <ResourceIcon type={resource.resourceType} />
          <div>
            <div className="text-sm font-medium">{resource.name}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <ProviderIcon type={resource.provider} size={12} />
              {resource.connectionName} · {resource.region}
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[10px] ${statusColor}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          {resource.status}
        </div>
      </div>

      {/* Specs */}
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        {specs.instanceType && (
          <span className="px-1.5 py-0.5 rounded bg-secondary/50">{specs.instanceType}</span>
        )}
        {specs.cpu && (
          <span className="flex items-center gap-0.5">
            <Cpu className="h-2.5 w-2.5" />{specs.cpu} vCPU
          </span>
        )}
        {specs.memoryMb && (
          <span className="flex items-center gap-0.5">
            <MemoryStick className="h-2.5 w-2.5" />{Math.round(specs.memoryMb / 1024)}GB
          </span>
        )}
        {specs.ipAddress && (
          <span className="flex items-center gap-0.5 font-mono">
            <Globe className="h-2.5 w-2.5" />{specs.ipAddress}
          </span>
        )}
      </div>

      {/* Metrics if available */}
      {(metrics.cpuPercent != null || metrics.memoryPercent != null) && (
        <div className="mt-2 flex gap-3 text-[10px]">
          {metrics.cpuPercent != null && (
            <span className={metrics.cpuPercent > 80 ? "text-red-400" : "text-muted-foreground"}>
              CPU: {metrics.cpuPercent.toFixed(0)}%
            </span>
          )}
          {metrics.memoryPercent != null && (
            <span className={metrics.memoryPercent > 80 ? "text-red-400" : "text-muted-foreground"}>
              RAM: {metrics.memoryPercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Open Server button for compute resources */}
      {isCompute && onOpenServer && (
        <button onClick={onOpenServer}
          className="mt-3 w-full text-xs px-3 py-1.5 rounded-lg glass border border-border/50 hover:border-primary/50 hover:bg-primary/5 font-medium flex items-center justify-center gap-1.5 transition opacity-70 group-hover:opacity-100">
          <ExternalLink className="h-3 w-3" /> Open Server
        </button>
      )}
    </div>
  );
}

// ─── Connect Provider Modal ───────────────────────────────────────────────

function ConnectModal({ provider, connName, setConnName, formData, setFormData, error, submitting, onSubmit, onClose }: {
  provider: InfraProvider; connName: string; setConnName: (v: string) => void;
  formData: Record<string, string>; setFormData: (v: Record<string, string>) => void;
  error: string; submitting: boolean; onSubmit: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <ProviderIcon type={provider.type} />
          <div>
            <h3 className="text-base font-semibold">Connect {provider.displayName}</h3>
            <p className="text-xs text-muted-foreground">Enter your credentials to connect</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Connection Name</label>
            <input value={connName} onChange={(e) => setConnName(e.target.value)}
              className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none border border-border/40 focus:border-primary" />
          </div>

          {provider.fields.map((field) => (
            <div key={field.key}>
              <label className="text-xs text-muted-foreground block mb-1">{field.label}</label>
              {field.type === "select" ? (
                <select value={formData[field.key] ?? ""} onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm border border-border/40">
                  <option value="">Select...</option>
                  {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={field.type === "password" ? "password" : "text"}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none border border-border/40 focus:border-primary"
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm glass hover:bg-secondary/60">Cancel</button>
          <button onClick={onSubmit} disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm btn-primary-grad font-medium disabled:opacity-50 flex items-center gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {submitting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Server Modal (Enhanced) ──────────────────────────────────────────

function AddServerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (s: Server) => void;
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
        name: form.name,
        host: form.host,
        provider: form.provider,
        region: form.region,
        sshUser: form.sshUser,
        sshPort: form.sshPort,
      });
      setCreatedServer(server);
      setStep("token");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add server.");
    } finally { setLoading(false); }
  }

  function handleDone() {
    if (createdServer) onCreated(createdServer);
    setStep("form");
    setCreatedServer(null);
    setForm({ name: "", host: "", provider: "custom", region: "", sshUser: "root", sshPort: 22, os: "Ubuntu 22.04", serverType: "vps" });
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
                <p className="text-xs text-muted-foreground">
                  Add any server — cloud, VPS, dedicated, or local
                </p>
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
                  <span className="text-xs text-muted-foreground block mb-1.5">Operating System</span>
                  <select className={inp} value={form.os}
                    onChange={(e) => setForm((f) => ({ ...f, os: e.target.value }))}>
                    {["Ubuntu 22.04", "Ubuntu 20.04", "Debian 12", "CentOS 9", "Rocky Linux", "AlmaLinux", "Windows Server", "Other"].map(
                      (os) => <option key={os} value={os}>{os}</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-1.5">Server Type</span>
                  <select className={inp} value={form.serverType}
                    onChange={(e) => setForm((f) => ({ ...f, serverType: e.target.value }))}>
                    {[
                      { value: "vps", label: "VPS" },
                      { value: "dedicated", label: "Dedicated Server" },
                      { value: "custom", label: "Custom Server" },
                      { value: "cloud", label: "Cloud Instance" },
                      { value: "local", label: "Local Server" },
                      { value: "other", label: "Other" },
                    ].map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-1.5">Provider</span>
                  <select className={inp} value={form.provider}
                    onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                    {[
                      { value: "custom", label: "Custom / Self-hosted" },
                      { value: "aws", label: "AWS" },
                      { value: "gcp", label: "GCP" },
                      { value: "azure", label: "Azure" },
                      { value: "digitalocean", label: "DigitalOcean" },
                      { value: "hetzner", label: "Hetzner" },
                      { value: "linode", label: "Linode" },
                      { value: "vultr", label: "Vultr" },
                      { value: "ovh", label: "OVH" },
                      { value: "other", label: "Other" },
                    ].map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground block mb-1.5">Region</span>
                  <input className={inp} placeholder="us-east-1" value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
                </label>
              </div>

              {/* Connection Method Info */}
              <div className="glass rounded-lg p-3 border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Connection Method: Agent Token</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  After adding the server, you'll receive a unique agent token. Install the Unwire AI agent
                  on your server and it will automatically report CPU, RAM, Disk, Network, running services,
                  containers, and logs.
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
          /* Token step */
          <AgentTokenStep server={createdServer} onDone={handleDone} />
        )}
      </div>
    </div>
  );
}

// ─── Agent Token Step ─────────────────────────────────────────────────────

function AgentTokenStep({ server, onDone }: { server: any; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"waiting" | "connected" | "error">("waiting");
  const [platform, setPlatform] = useState<"linux" | "windows" | "docker">("linux");
  const token = server?.agentToken ?? server?.agentTokenMasked ?? "—";
  const serverUrl = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:5000";

  // Poll for agent connection
  useEffect(() => {
    if (!server?.id) return;
    let active = true;
    const pollConnection = async () => {
      try {
        const health = await fetchServerHealth(server.id);
        if (health && health.server && health.server.status === "online") {
          if (active) setConnectionStatus("connected");
          return true;
        }
      } catch {}
      return false;
    };

    const interval = setInterval(async () => {
      const connected = await pollConnection();
      if (connected) clearInterval(interval);
    }, 3000); // Poll every 3 seconds

    return () => { active = false; clearInterval(interval); };
  }, [server?.id]);

  function copyToken() {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Token copied to clipboard!");
  }

  function copyCommand(cmd: string) {
    navigator.clipboard.writeText(cmd);
    toast.success("Command copied!");
  }

  const linuxCmd = `curl -fsSL ${serverUrl}/install.sh | sudo bash -s -- --token "${token}" --server "${serverUrl}"`;

  const windowsCmd = `# PowerShell (Run as Administrator)
irm "${serverUrl}/install.sh" | bash -s -- --token ${token} --server ${serverUrl}`;

  const dockerCmd = `docker run -d --name unwire-agent \\
  --restart unless-stopped \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -e AGENT_TOKEN=${token} \\
  -e SERVER_URL=${serverUrl} \\
  unwireai/agent:latest`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
          connectionStatus === "connected"
            ? "bg-green-500/10 border border-green-500/30"
            : "bg-primary/10 border border-primary/30"
        }`}>
          {connectionStatus === "connected"
            ? <CheckCircle2 className="h-5 w-5 text-green-400" />
            : <ServerIcon className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {connectionStatus === "connected" ? "Server Connected!" : "Install Agent"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {connectionStatus === "connected"
              ? "Agent is reporting data. You're all set!"
              : "Install the agent on your server to start monitoring"}
          </p>
        </div>
      </div>

      {/* Connection Status Badge */}
      <div className={`glass rounded-lg p-3 border flex items-center gap-3 ${
        connectionStatus === "connected"
          ? "border-green-500/30 bg-green-500/5"
          : "border-yellow-500/20 bg-yellow-500/5"
      }`}>
        {connectionStatus === "waiting" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            <div>
              <div className="text-xs font-medium text-yellow-400">Waiting for agent connection...</div>
              <div className="text-[10px] text-muted-foreground">Install the agent below. This page will update automatically.</div>
            </div>
          </>
        )}
        {connectionStatus === "connected" && (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <div>
              <div className="text-xs font-medium text-green-400">Agent Connected</div>
              <div className="text-[10px] text-muted-foreground">Receiving metrics, processes, and logs.</div>
            </div>
          </>
        )}
      </div>

      {/* Agent Token */}
      <div className="glass rounded-lg p-4 border border-primary/20">
        <div className="text-xs font-medium text-primary mb-2 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Agent Token
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-secondary/50 px-3 py-2 rounded border border-border truncate">
            {token}
          </code>
          <button onClick={copyToken}
            className="px-3 py-2 rounded-lg glass text-xs font-medium hover:bg-secondary/60 shrink-0">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Save this token securely. It won't be shown again after closing.
        </p>
      </div>

      {/* Platform Tabs */}
      <div className="glass rounded-lg overflow-hidden">
        <div className="flex border-b border-border">
          {(["linux", "windows", "docker"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                platform === p
                  ? "bg-primary/10 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {p === "linux" ? "🐧 Linux / macOS" : p === "windows" ? "🪟 Windows" : "🐳 Docker"}
            </button>
          ))}
        </div>
        <div className="p-3">
          <div className="bg-secondary/50 rounded-lg p-3 font-mono text-[11px] text-muted-foreground space-y-0.5 overflow-x-auto relative">
            <pre className="whitespace-pre-wrap">{
              platform === "linux" ? linuxCmd : platform === "windows" ? windowsCmd : dockerCmd
            }</pre>
            <button onClick={() => copyCommand(platform === "linux" ? linuxCmd : platform === "windows" ? windowsCmd : dockerCmd)}
              className="absolute top-2 right-2 px-2 py-1 rounded glass text-[10px] hover:bg-secondary/80">
              Copy
            </button>
          </div>
        </div>
      </div>

      <button onClick={onDone}
        className="w-full btn-primary-grad rounded-lg py-2.5 font-medium">
        {connectionStatus === "connected" ? "View Server Dashboard →" : "Done"}
      </button>
    </div>
  );
}
