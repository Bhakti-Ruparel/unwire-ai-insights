import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import {
  apiListDeployments, apiRollbackDeployment, apiGetDeploymentPlan,
  apiCreateDeployment, fetchServers,
} from "@/services/api";
import type { DeploymentRun, DeploymentPlan, Server } from "@/types/project";
import {
  Loader2, AlertCircle, Rocket, RefreshCw, RotateCcw,
  CheckCircle2, XCircle, Clock, ChevronRight, ChevronDown,
  Play, GitBranch, Server as ServerIcon, X, ExternalLink,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/projects/$projectId/deployments")({
  component: DeploymentsPage,
});

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  QUEUED:      { icon: Clock,         color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Queued"      },
  RUNNING:     { icon: RefreshCw,     color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",    label: "Running"     },
  SUCCESS:     { icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  label: "Success"     },
  FAILED:      { icon: XCircle,       color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",      label: "Failed"      },
  ROLLED_BACK: { icon: RotateCcw,     color: "text-gray-400",   bg: "bg-gray-500/10 border-gray-500/30",    label: "Rolled Back" },
} as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.QUEUED;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

function duration(dep: DeploymentRun): string {
  if (!dep.startedAt || !dep.completedAt) return "—";
  const ms = new Date(dep.completedAt).getTime() - new Date(dep.startedAt).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ─── Deploy Modal ─────────────────────────────────────────────────────────

function DeployModal({
  projectId,
  open,
  onClose,
  onDeployed,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onDeployed: (dep: DeploymentRun) => void;
}) {
  const [servers,   setServers]   = useState<Server[]>([]);
  const [plan,      setPlan]      = useState<DeploymentPlan | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [serverId,  setServerId]  = useState("");
  const [branch,    setBranch]    = useState("main");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([fetchServers(), apiGetDeploymentPlan(projectId)])
      .then(([srvs, p]) => { setServers(srvs); setPlan(p); if (srvs[0]) setServerId(srvs[0].id); })
      .finally(() => setLoading(false));
  }, [open, projectId]);

  if (!open) return null;

  async function handleDeploy() {
    if (!serverId) { toast.error("Select a server."); return; }
    setDeploying(true);
    try {
      const dep = await apiCreateDeployment({ projectId, serverId, branch });
      toast.success(`Deployment v${dep.version} queued`);
      onDeployed(dep);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deployment failed to start.");
    } finally {
      setDeploying(false);
    }
  }

  const inp = "w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl btn-primary-grad flex items-center justify-center">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Deploy Project</h2>
            <p className="text-sm text-muted-foreground">AI-assisted deployment</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Analyzing project…</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* AI Plan summary */}
            {plan && (
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Deployment Plan</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ["Runtime",   plan.runtime],
                    ["Port",      String(plan.port)],
                    ["Framework", plan.backendFramework ?? plan.frontendFramework ?? "—"],
                    ["Database",  plan.database ?? "None"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-mono font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 flex flex-wrap gap-1.5">
                  {plan.dockerRequired      && <Tag>Dockerfile</Tag>}
                  {plan.dockerComposeNeeded && <Tag>docker-compose</Tag>}
                  {plan.nginxNeeded         && <Tag>nginx</Tag>}
                </div>
                {plan.warnings.length > 0 && (
                  <div className="space-y-1">
                    {plan.warnings.map((w, i) => (
                      <div key={i} className="text-xs text-yellow-400 flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Server select */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1.5">Target Server</label>
              {servers.length === 0 ? (
                <div className="text-sm text-muted-foreground glass rounded-xl p-3 border border-yellow-500/30 bg-yellow-500/5">
                  No servers connected. <Link to="/servers" className="text-primary hover:underline">Connect a server first →</Link>
                </div>
              ) : (
                <select className={inp} value={serverId} onChange={(e) => setServerId(e.target.value)}>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Branch */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1.5">Branch</label>
              <input className={inp} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>

            <button
              onClick={handleDeploy}
              disabled={deploying || servers.length === 0}
              className="w-full btn-primary-grad rounded-md py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {deploying ? <><Loader2 className="h-4 w-4 animate-spin" />Starting deployment…</> : <><Rocket className="h-4 w-4" />Confirm Deployment</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
      {children}
    </span>
  );
}

// ─── Deployments Page ─────────────────────────────────────────────────────

function DeploymentsPage() {
  const { projectId }   = useParams({ from: "/projects/$projectId/deployments" });
  const navigate        = useNavigate();
  const { isLoggedIn }  = useAuth();

  const [deployments, setDeployments] = useState<DeploymentRun[]>([]);
  const [nextCursor,  setNextCursor]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [deployModal, setDeployModal] = useState(false);

  // Stats
  const total     = deployments.length;
  const succeeded = deployments.filter((d) => d.status === "SUCCESS").length;
  const failed    = deployments.filter((d) => d.status === "FAILED").length;
  const running   = deployments.filter((d) => d.status === "RUNNING" || d.status === "QUEUED").length;

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await apiListDeployments(projectId, cursor);
      if (cursor) setDeployments((prev) => [...prev, ...res.deployments]);
      else setDeployments(res.deployments);
      setNextCursor(res.nextCursor);
    } catch { setError("Failed to load deployments."); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Poll for running deployments
  useEffect(() => {
    const hasActive = deployments.some((d) => d.status === "RUNNING" || d.status === "QUEUED");
    if (!hasActive) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [deployments, load]);

  async function handleRollback(dep: DeploymentRun) {
    if (!confirm(`Rollback to before v${dep.version}? A new deployment will be created.`)) return;
    try {
      const newDep = await apiRollbackDeployment(dep.id);
      toast.success(`Rollback v${newDep.version} queued`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed.");
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Deployments</h2>
      <div className="flex items-center gap-3 justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" /><span>Loading deployments…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Deployments</h2>
      <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" /><span className="text-sm">{error}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Toaster theme="dark" position="bottom-right" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Deployments</h2>
          <p className="text-muted-foreground text-sm mt-1">Production deployment history and live status.</p>
        </div>
        <button
          onClick={() => setDeployModal(true)}
          className="btn-primary-grad px-4 py-2.5 rounded-md font-medium flex items-center gap-2"
        >
          <Rocket className="h-4 w-4" /> Deploy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total",     value: total,     color: "text-foreground"   },
          { label: "Succeeded", value: succeeded, color: "text-green-400"   },
          { label: "Failed",    value: failed,    color: "text-red-400"     },
          { label: "Active",    value: running,   color: "text-blue-400"    },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Rocket className="h-10 w-10 opacity-30" />
          <p className="text-sm">No deployments yet.</p>
          <button onClick={() => setDeployModal(true)} className="btn-primary-grad px-4 py-2 rounded-md text-sm font-medium">
            Deploy your first build
          </button>
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Version</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Server</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Branch</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Duration</th>
                  <th className="text-left px-4 py-3 hidden xl:table-cell">When</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((dep) => (
                  <tr key={dep.id} className="border-t border-border hover:bg-secondary/10 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold">v{dep.version}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <ServerIcon className="h-3 w-3" />
                        {dep.serverName || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <StatusBadge status={dep.status} />
                        {(dep.status === "RUNNING" || dep.status === "QUEUED") && (
                          <div className="w-24 h-1 rounded-full bg-secondary/60">
                            <div
                              className="h-full rounded-full bg-blue-400 transition-all duration-500"
                              style={{ width: `${dep.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-mono">
                        <GitBranch className="h-3 w-3" />{dep.branch}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs font-mono">
                      {duration(dep)}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-muted-foreground text-xs">
                      {new Date(dep.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to="/deployments/$deploymentId"
                          params={{ deploymentId: dep.id }}
                          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
                          title="View details"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        {dep.status === "SUCCESS" && (
                          <button
                            onClick={() => handleRollback(dep)}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-yellow-400 hover:bg-yellow-500/10 transition"
                            title="Rollback to before this version"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {nextCursor && (
            <div className="text-center">
              <button
                onClick={() => load(nextCursor)}
                disabled={loadingMore}
                className="px-6 py-2 rounded-lg border border-border text-sm hover:bg-secondary/40 transition disabled:opacity-60"
              >
                {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</> : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      <DeployModal
        projectId={projectId}
        open={deployModal}
        onClose={() => setDeployModal(false)}
        onDeployed={(dep) => {
          setDeployments((prev) => [dep, ...prev]);
          navigate({ to: "/deployments/$deploymentId", params: { deploymentId: dep.id } });
        }}
      />
    </div>
  );
}
