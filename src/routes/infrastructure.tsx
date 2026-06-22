import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  fetchInfraProviders, fetchInfraConnections, fetchInfraResources,
  connectInfraProvider, disconnectInfraProvider, syncInfraConnection,
  type InfraProvider, type InfraConnection, type CloudResourceItem,
} from "@/services/api";
import {
  Cloud, Plus, RefreshCw, Loader2, CheckCircle2, XCircle,
  Server, Container, Database, Network, HardDrive, Cpu, MemoryStick,
  Trash2, Zap, Globe,
} from "lucide-react";

export const Route = createFileRoute("/infrastructure")({
  head: () => ({ meta: [{ title: "Infrastructure · Unwire AI" }] }),
  component: InfrastructurePage,
});

function InfrastructurePage() {
  const [providers, setProviders] = useState<InfraProvider[]>([]);
  const [connections, setConnections] = useState<InfraConnection[]>([]);
  const [resources, setResources] = useState<CloudResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<InfraProvider | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [connName, setConnName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [p, c, r] = await Promise.all([
      fetchInfraProviders(), fetchInfraConnections(),
      fetchInfraResources({ limit: 50 }),
    ]);
    setProviders(p); setConnections(c); setResources(r.resources);
    setLoading(false);
  }

  async function handleConnect() {
    if (!connectModal || !connName.trim()) return;
    setSubmitting(true); setError("");
    try {
      await connectInfraProvider(connectModal.type, connName.trim(), formData);
      setConnectModal(null); setFormData({}); setConnName("");
      loadAll();
    } catch (e: any) { setError(e.message ?? "Connection failed."); }
    setSubmitting(false);
  }

  async function handleDisconnect(id: string) {
    await disconnectInfraProvider(id);
    loadAll();
  }

  async function handleSync(id: string) {
    await syncInfraConnection(id);
    loadAll();
  }

  function getConnForProvider(type: string) {
    return connections.find((c) => c.provider === type && c.status !== "disconnected");
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Cloud className="h-6 w-6" /> Infrastructure</h1>
              <p className="text-sm text-muted-foreground mt-1">Connect and manage multi-cloud resources</p>
            </div>
            <div className="text-xs text-muted-foreground">
              {connections.length} provider{connections.length !== 1 ? "s" : ""} connected · {resources.length} resources
            </div>
          </div>

          {/* Provider Cards */}
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

          {/* Resources */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : resources.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Cloud className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No cloud resources discovered yet</p>
              <p className="text-xs text-muted-foreground mt-1">Connect a cloud provider above to discover your infrastructure.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Discovered Resources</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {resources.map((r) => <ResourceCard key={r.id} resource={r} />)}
              </div>
            </div>
          )}
        </div>

        {/* Connect Modal */}
        {connectModal && (
          <ConnectModal provider={connectModal} connName={connName} setConnName={setConnName}
            formData={formData} setFormData={setFormData} error={error}
            submitting={submitting} onSubmit={handleConnect}
            onClose={() => { setConnectModal(null); setError(""); }} />
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
  return (
    <div className={`glass rounded-xl p-4 border transition ${connected ? "border-green-500/30" : hasError ? "border-red-500/30" : "border-border/40"}`}>
      <div className="flex flex-col items-center text-center gap-2">
        <ProviderIcon type={provider.type} />
        <span className="text-xs font-medium">{provider.displayName}</span>
        {connected && (
          <>
            <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Connected</span>
            <span className="text-[10px] text-muted-foreground">{connection.resourceCount} resources</span>
            <div className="flex gap-1 mt-1">
              {onSync && <button onClick={onSync} className="text-[10px] px-2 py-0.5 rounded glass hover:bg-secondary/60"><RefreshCw className="h-3 w-3" /></button>}
              {onDisconnect && <button onClick={onDisconnect} className="text-[10px] px-2 py-0.5 rounded glass text-red-400 hover:bg-red-500/10"><Trash2 className="h-3 w-3" /></button>}
            </div>
          </>
        )}
        {hasError && <span className="text-[10px] text-red-400">Error</span>}
        {!connection && (
          <button onClick={onConnect} className="mt-1 text-[10px] px-3 py-1 rounded-lg btn-primary-grad font-medium flex items-center gap-1">
            <Plus className="h-3 w-3" />Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Resource Card ────────────────────────────────────────────────────────

function ResourceCard({ resource }: { resource: CloudResourceItem }) {
  const specs = resource.specs ?? {};
  const metrics = resource.metrics ?? {};
  const statusColor = resource.status === "running" ? "text-green-400" : resource.status === "stopped" ? "text-yellow-400" : "text-red-400";
  const statusDot = resource.status === "running" ? "bg-green-400" : resource.status === "stopped" ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="glass rounded-xl p-4 border border-border/40 hover:border-primary/30 transition">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <ResourceIcon type={resource.resourceType} />
          <div>
            <div className="text-sm font-medium">{resource.name}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <ProviderIcon type={resource.provider} size={10} />
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
        {specs.instanceType && <span className="px-1.5 py-0.5 rounded bg-secondary/50">{specs.instanceType}</span>}
        {specs.cpu && <span className="flex items-center gap-0.5"><Cpu className="h-2.5 w-2.5" />{specs.cpu} vCPU</span>}
        {specs.memoryMb && <span className="flex items-center gap-0.5"><MemoryStick className="h-2.5 w-2.5" />{Math.round(specs.memoryMb / 1024)}GB</span>}
        {specs.ipAddress && <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />{specs.ipAddress}</span>}
      </div>
      {/* Metrics */}
      {(metrics.cpuPercent != null || metrics.memoryPercent != null) && (
        <div className="mt-2 flex gap-3 text-[10px]">
          {metrics.cpuPercent != null && <span className={metrics.cpuPercent > 80 ? "text-red-400" : "text-muted-foreground"}>CPU: {metrics.cpuPercent.toFixed(0)}%</span>}
          {metrics.memoryPercent != null && <span className={metrics.memoryPercent > 80 ? "text-red-400" : "text-muted-foreground"}>RAM: {metrics.memoryPercent.toFixed(0)}%</span>}
        </div>
      )}
    </div>
  );
}

// ─── Connect Modal ────────────────────────────────────────────────────────

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

// ─── Icons ────────────────────────────────────────────────────────────────

function ProviderIcon({ type, size = 16 }: { type: string; size?: number }) {
  const cls = `h-${size <= 12 ? 3 : 5} w-${size <= 12 ? 3 : 5}`;
  const colors: Record<string, string> = {
    aws: "text-orange-400", digitalocean: "text-blue-400", azure: "text-sky-400",
    gcp: "text-red-400", hetzner: "text-rose-400", docker: "text-cyan-400",
  };
  return <Cloud className={`${cls} ${colors[type] ?? "text-muted-foreground"}`} />;
}

function ResourceIcon({ type }: { type: string }) {
  switch (type) {
    case "instance": return <Server className="h-5 w-5 text-primary shrink-0" />;
    case "container": return <Container className="h-5 w-5 text-cyan-400 shrink-0" />;
    case "database": return <Database className="h-5 w-5 text-yellow-400 shrink-0" />;
    case "volume": return <HardDrive className="h-5 w-5 text-purple-400 shrink-0" />;
    case "network": return <Network className="h-5 w-5 text-green-400 shrink-0" />;
    default: return <Cloud className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}
