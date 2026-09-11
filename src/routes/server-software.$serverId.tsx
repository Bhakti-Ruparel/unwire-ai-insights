import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  Search, Download, Trash2, CheckCircle2, Loader2, Package,
  Database, Server, Globe, Monitor, Code2, Wrench, RefreshCw,
} from "lucide-react";
import { toast, Toaster } from "sonner";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:5000";

export const Route = createFileRoute("/server-software/$serverId")({
  head: () => ({ meta: [{ title: "Software Marketplace · Unwire AI" }] }),
  component: SoftwareMarketplace,
});

interface SoftwareItem {
  id: string; name: string; description: string; category: string;
  icon: string; versions: string[]; defaultVersion: string; tags: string[];
}

interface InstalledItem {
  id: string; softwareId: string; softwareName: string; version: string;
  status: string; os: string; installedAt: string | null;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  databases: Database, backend: Server, frontend: Globe,
  devops: Wrench, monitoring: Monitor, languages: Code2,
};

function SoftwareMarketplace() {
  const { serverId } = useParams({ from: "/server-software/$serverId" });
  const [registry, setRegistry] = useState<SoftwareItem[]>([]);
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  const token = localStorage.getItem("unwire_access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = localStorage.getItem("unwire_active_org");
  if (orgId) headers["X-Organization-Id"] = orgId;

  const loadData = useCallback(async () => {
    try {
      const [regRes, instRes] = await Promise.all([
        fetch(`${API_BASE}/api/software/registry`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/software/servers/${serverId}/installed`, { headers }).then(r => r.json()),
      ]);
      setRegistry(regRes.data?.software ?? []);
      setInstalled(instRes.data ?? []);
    } catch {}
    setLoading(false);
  }, [serverId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh while installations are in progress
  useEffect(() => {
    const hasActive = installed.some(i => i.status === "queued" || i.status === "installing" || i.status === "verifying");
    if (!hasActive) return;
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [installed, loadData]);

  async function handleInstall(softwareId: string, version?: string) {
    setInstalling(softwareId);
    try {
      const res = await fetch(`${API_BASE}/api/software/servers/${serverId}/install`, {
        method: "POST", headers, body: JSON.stringify({ softwareId, version }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Installing ${softwareId}...`);
      setTimeout(loadData, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "Installation failed.");
    }
    setInstalling(null);
  }

  async function handleBootstrap() {
    setInstalling("bootstrap");
    try {
      const res = await fetch(`${API_BASE}/api/software/servers/${serverId}/bootstrap`, {
        method: "POST", headers,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Bootstrapping server — installing ${json.data?.queued?.length ?? 0} packages...`);
      setTimeout(loadData, 3000);
    } catch (err: any) {
      toast.error(err.message ?? "Bootstrap failed.");
    }
    setInstalling(null);
  }

  async function handleUninstall(softwareId: string) {
    if (!confirm(`Remove ${softwareId}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/software/servers/${serverId}/uninstall`, {
        method: "POST", headers, body: JSON.stringify({ softwareId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Uninstalling...");
      setTimeout(loadData, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "Uninstall failed.");
    }
  }

  const filtered = registry.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.tags.some(t => t.includes(q)) || s.description.toLowerCase().includes(q);
  });

  const installedMap = new Map(installed.map(i => [i.softwareId, i]));

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" /> Software Marketplace
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Install and manage software on your server — no manual commands needed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleBootstrap} disabled={installing === "bootstrap"}
                className="px-4 py-2 rounded-lg text-xs font-medium btn-primary-grad inline-flex items-center gap-1.5 disabled:opacity-50">
                {installing === "bootstrap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {installing === "bootstrap" ? "Bootstrapping..." : "⚡ Prepare Server"}
              </button>
              <button onClick={loadData} className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-secondary/40">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Search + Categories */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search software..." className="w-full pl-9 pr-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["all", "databases", "languages", "devops", "frontend", "monitoring"].map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    category === cat ? "bg-primary/10 text-primary border border-primary/30" : "glass text-muted-foreground hover:text-foreground"
                  }`}>
                  {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((sw) => {
                const inst = installedMap.get(sw.id);
                const isInstalled = inst?.status === "installed";
                const isInstalling = inst?.status === "queued" || inst?.status === "installing" || inst?.status === "verifying" || installing === sw.id;
                const CatIcon = CATEGORY_ICONS[sw.category] ?? Package;

                return (
                  <div key={sw.id} className={`glass rounded-xl p-5 border transition hover:shadow-lg ${
                    isInstalled ? "border-green-500/20" : "border-border/40 hover:border-primary/30"
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{sw.icon}</span>
                        <div>
                          <div className="font-semibold text-sm">{sw.name}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <CatIcon className="h-2.5 w-2.5" /> {sw.category}
                          </div>
                        </div>
                      </div>
                      {isInstalled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Installed
                        </span>
                      )}
                      {isInstalling && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> {inst?.status ?? "Installing"}
                        </span>
                      )}
                      {inst?.status === "failed" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                          Failed
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{sw.description}</p>

                    {/* Show error message if failed */}
                    {inst?.status === "failed" && (inst as any).error && (
                      <div className="mt-2 text-[10px] text-red-400 bg-red-500/5 rounded p-2 border border-red-500/10 truncate">
                        {(inst as any).error}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                      <span>Versions: {sw.versions.join(", ")}</span>
                      {inst?.version && <span>• Installed: v{inst.version}</span>}
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      {isInstalled ? (
                        <button onClick={() => handleUninstall(sw.id)}
                          className="flex-1 text-xs px-3 py-2 rounded-lg glass border border-red-500/20 text-red-400 hover:bg-red-500/10 font-medium flex items-center justify-center gap-1.5">
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      ) : (
                        <button onClick={() => handleInstall(sw.id)} disabled={isInstalling}
                          className="flex-1 text-xs px-3 py-2 rounded-lg btn-primary-grad font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                          {isInstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          {isInstalling ? (inst?.status === "verifying" ? "Verifying..." : "Installing...") : "Install"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No software found matching "{search}"</p>
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
