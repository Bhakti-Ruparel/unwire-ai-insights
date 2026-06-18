import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  fetchServers, createServer, deleteServer,
} from "@/services/api";
import type { Server, CreateServerPayload } from "@/types/project";
import {
  Plus, Loader2, AlertCircle, Server as ServerIcon,
  Cpu, HardDrive, MemoryStick, Trash2, X, Globe,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/servers/")({
  head: () => ({ meta: [{ title: "Servers · Unwire AI" }] }),
  component: ServersPage,
});

// ─── Status badge ─────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  online:   { dot: "bg-green-400",  text: "text-green-400",  label: "Online"   },
  offline:  { dot: "bg-red-400",    text: "text-red-400",    label: "Offline"  },
  degraded: { dot: "bg-yellow-400", text: "text-yellow-400", label: "Degraded" },
  unknown:  { dot: "bg-gray-400",   text: "text-gray-400",   label: "Unknown"  },
} as const;

function StatusDot({ status }: { status: Server["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cfg.dot} ${status === "online" ? "animate-pulse" : ""}`} />
      <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

// ─── Gauge bar ────────────────────────────────────────────────────────────

function Gauge({ label, value }: { label: string; value: number }) {
  const color = value > 85 ? "bg-red-500" : value > 65 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{value.toFixed(0)}%</span>
      </div>
      <div className="h-1 rounded-full bg-secondary/60">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Add Server Modal ─────────────────────────────────────────────────────

function AddServerModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (s: Server) => void;
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
      toast.success("Server connected");
      setForm({ name: "", host: "", provider: "custom", region: "", sshUser: "root", sshPort: 22 });
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
              <input className={inp} placeholder="Production API" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="block col-span-2">
              <span className="text-xs text-muted-foreground block mb-1.5">Host / IP address</span>
              <input className={inp} placeholder="192.168.1.1 or api.example.com" value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} required />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Provider</span>
              <select className={inp} value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                {["custom", "aws", "gcp", "azure", "digitalocean", "hetzner", "linode"].map((p) => (
                  <option key={p} value={p}>{p.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">Region</span>
              <input className={inp} placeholder="ap-south-1" value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">SSH user</span>
              <input className={inp} value={form.sshUser}
                onChange={(e) => setForm((f) => ({ ...f, sshUser: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground block mb-1.5">SSH port</span>
              <input className={inp} type="number" value={form.sshPort}
                onChange={(e) => setForm((f) => ({ ...f, sshPort: parseInt(e.target.value) || 22 }))} />
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

// ─── Server card ──────────────────────────────────────────────────────────

function ServerCard({ server, onDelete }: { server: Server; onDelete: () => void }) {
  const m = server.latestMetric;

  return (
    <article className="glass rounded-2xl p-5 flex flex-col gap-4 hover:bg-secondary/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-secondary/60 border border-border flex items-center justify-center shrink-0">
            <ServerIcon className="h-5 w-5 text-accent" />
          </div>
          <div>
            <div className="font-semibold">{server.name}</div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">{server.host}</div>
          </div>
        </div>
        <StatusDot status={server.status} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {server.provider !== "custom" && (
          <span className="font-mono px-2 py-0.5 rounded bg-secondary/60 border border-border uppercase">
            {server.provider}
          </span>
        )}
        {server.region && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Globe className="h-3 w-3" />{server.region}
          </span>
        )}
        <span className="text-muted-foreground">{server.appCount} app{server.appCount !== 1 ? "s" : ""}</span>
      </div>

      {m ? (
        <div className="space-y-2">
          <Gauge label="CPU"  value={m.cpuPercent}  />
          <Gauge label="RAM"  value={m.ramPercent}  />
          <Gauge label="Disk" value={m.diskPercent} />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-border rounded-lg">
          No metrics yet — agent not connected
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        <Link
          to="/servers/$serverId"
          params={{ serverId: server.id }}
          className="flex-1 btn-primary-grad rounded-md py-2 text-sm font-medium text-center"
        >
          Manage
        </Link>
        <button
          onClick={onDelete}
          className="h-9 w-9 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
          title="Remove server"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [modal,   setModal]   = useState(false);

  useEffect(() => {
    fetchServers().then(setServers).catch(() => setError("Failed to load servers.")).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    try {
      await deleteServer(id);
      setServers((s) => s.filter((sv) => sv.id !== id));
      toast.success("Server removed");
    } catch { toast.error("Failed to remove server."); }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Toaster theme="dark" position="bottom-right" />
      <main className="mx-auto max-w-7xl px-6 py-10">

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Servers</h1>
            <p className="mt-1 text-muted-foreground">Monitor and manage your production infrastructure.</p>
          </div>
          <button onClick={() => setModal(true)}
            className="btn-primary-grad px-4 py-2.5 rounded-md font-medium inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Connect Server
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" /><span>Loading servers…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-3 glass rounded-xl p-4 border border-destructive/30 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" /><span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && servers.length === 0 && (
          <div className="text-center py-20">
            <ServerIcon className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-4" />
            <p className="text-muted-foreground">No servers connected yet.</p>
            <button onClick={() => setModal(true)}
              className="mt-4 btn-primary-grad px-5 py-2.5 rounded-md font-medium inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Connect your first server
            </button>
          </div>
        )}

        {!loading && !error && servers.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {servers.map((s) => (
              <ServerCard key={s.id} server={s} onDelete={() => handleDelete(s.id)} />
            ))}
          </div>
        )}
      </main>

      <AddServerModal
        open={modal}
        onClose={() => setModal(false)}
        onCreated={(s) => { setServers((prev) => [s, ...prev]); setModal(false); }}
      />
    </div>
  );
}
