import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { apiGetDeployment, apiRollbackDeployment, openDeploymentLogStream } from "@/services/api";
import type { DeploymentRun, DeploymentLog } from "@/types/project";
import {
  Loader2, AlertCircle, ChevronLeft, CheckCircle2, XCircle,
  Clock, RefreshCw, RotateCcw, GitBranch, Server, Circle,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/deployments/$deploymentId")({
  head: () => ({ meta: [{ title: "Deployment · Unwire AI" }] }),
  component: DeploymentDetailPage,
});

function StepIcon({ status, spinning }: { status: string; spinning?: boolean }) {
  if (status === "success") return <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />;
  if (status === "failed")  return <XCircle      className="h-5 w-5 text-red-400   shrink-0" />;
  if (status === "running") return <Loader2      className={`h-5 w-5 text-blue-400 shrink-0 ${spinning ? "animate-spin" : ""}`} />;
  if (status === "skipped") return <Circle       className="h-5 w-5 text-gray-500  shrink-0" />;
  return <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />;
}

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? "bg-green-500" : "bg-primary";
  return (
    <div className="w-full h-2 rounded-full bg-secondary/60 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
    </div>
  );
}

const LOG_COLOR: Record<string, string> = {
  info: "text-blue-300", warn: "text-yellow-300", error: "text-red-400", debug: "text-gray-400",
};

function DeploymentDetailPage() {
  const { deploymentId } = useParams({ from: "/deployments/$deploymentId" });

  const [dep,       setDep]       = useState<DeploymentRun | null>(null);
  const [logs,      setLogs]      = useState<DeploymentLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef     = useRef<EventSource | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    setLoading(true);
    apiGetDeployment(deploymentId)
      .then((d) => { if (!d) setError("Deployment not found."); else setDep(d); })
      .catch(() => setError("Unable to load deployment."))
      .finally(() => setLoading(false));
  }, [deploymentId]);

  useEffect(() => {
    if (!dep) return;
    const isActive = dep.status === "RUNNING" || dep.status === "QUEUED";

    if (isActive && !streaming) {
      setStreaming(true);
      esRef.current = openDeploymentLogStream(
        deploymentId,
        (log) => setLogs((prev) => [...prev, log]),
        () => { setStreaming(false); apiGetDeployment(deploymentId).then((d) => { if (d) setDep(d); }); },
        () => { setStreaming(false); startPolling(); }
      );
    }
    if (!isActive && logs.length === 0) loadLogsOnce();

    return () => {
      esRef.current?.close(); esRef.current = null;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [dep?.status]);

  async function loadLogsOnce() {
    const { apiGetDeploymentLogs } = await import("@/services/api");
    const { logs: initial } = await apiGetDeploymentLogs(deploymentId, undefined, 200);
    setLogs(initial);
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const d = await apiGetDeployment(deploymentId);
      if (!d) return;
      setDep(d);
      if (d.status !== "RUNNING" && d.status !== "QUEUED") {
        clearInterval(pollRef.current!); pollRef.current = null; loadLogsOnce();
      }
    }, 3000);
  }

  async function handleRollback() {
    if (!dep || !confirm("Create a rollback deployment?")) return;
    try {
      const newDep = await apiRollbackDeployment(dep.id);
      toast.success(`Rollback v${newDep.version} queued`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed.");
    }
  }

  if (loading) return (
    <AuthGuard>
      <DashboardLayout>
        <div className="flex items-center gap-3 justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /><span>Loading deployment…</span>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );

  if (error || !dep) return (
    <AuthGuard>
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error ?? "Deployment not found."}</span>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );

  const isActive  = dep.status === "RUNNING" || dep.status === "QUEUED";
  const isSuccess = dep.status === "SUCCESS";
  const isFailed  = dep.status === "FAILED";
  const statusColor = isSuccess ? "text-green-400" : isFailed ? "text-red-400" : isActive ? "text-blue-400" : "text-gray-400";

  return (
    <AuthGuard>
      <DashboardLayout>
        <Toaster theme="dark" position="bottom-right" />

        <main className="mx-auto max-w-6xl px-6 py-6 space-y-6">
          <div>
            <Link to="/projects/$projectId/deployments" params={{ projectId: dep.projectId }}
              className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground mb-3">
              <ChevronLeft className="h-3 w-3" /> {dep.projectName} / Deployments
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold">Deployment v{dep.version}</h1>
                  <span className={`text-sm font-medium ${statusColor} ${isActive ? "animate-pulse" : ""}`}>● {dep.status}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />{dep.serverName}</span>
                  <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{dep.branch}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{new Date(dep.createdAt).toLocaleString()}</span>
                </div>
              </div>
              {isSuccess && (
                <button onClick={handleRollback}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-border hover:bg-secondary/40 transition">
                  <RotateCcw className="h-4 w-4" /> Rollback
                </button>
              )}
            </div>
          </div>

          {isActive && (
            <div className="glass rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-mono font-medium">{dep.progress}%</span>
              </div>
              <ProgressBar value={dep.progress} />
            </div>
          )}

          <div className="grid lg:grid-cols-[320px_1fr] gap-6">
            {/* Pipeline steps */}
            <div className="glass rounded-2xl p-5 h-fit">
              <div className="text-sm font-medium mb-4">Pipeline Steps</div>
              <div className="space-y-1">
                {dep.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Steps will appear when deployment starts.</p>
                ) : (
                  dep.steps.map((step, i) => (
                    <div key={step.id} className="flex items-start gap-3 py-2">
                      <div className="flex flex-col items-center gap-0 shrink-0">
                        <StepIcon status={step.status} spinning={step.status === "running"} />
                        {i < dep.steps.length - 1 && (
                          <div className={`w-0.5 h-4 my-0.5 rounded-full ${step.status === "success" ? "bg-green-500/40" : "bg-border"}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${
                          step.status === "running" ? "text-blue-400" :
                          step.status === "failed"  ? "text-red-400"  :
                          step.status === "success" ? "text-foreground" : "text-muted-foreground"
                        }`}>{step.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {step.durationMs && <span className="text-xs text-muted-foreground font-mono">{(step.durationMs / 1000).toFixed(1)}s</span>}
                          {step.error && <span className="text-xs text-red-400 truncate">{step.error}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Live log terminal */}
            <div className="glass rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "400px" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20 shrink-0">
                <div className="text-sm font-medium font-mono flex items-center gap-2">
                  {streaming && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />}
                  <span>Deployment Logs</span>
                  <span className="text-muted-foreground text-xs">({logs.length} lines)</span>
                </div>
                {isActive && (
                  <span className="text-xs text-blue-400 flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin" />Live
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5 bg-background/50" style={{ maxHeight: "500px" }}>
                {logs.length === 0 && (
                  <div className="text-muted-foreground text-center py-8">
                    {isActive ? "Waiting for logs…" : "No logs available."}
                  </div>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3 leading-5">
                    <span className="text-muted-foreground/60 shrink-0 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    {log.stepName && <span className="text-accent/70 shrink-0">[{log.stepName}]</span>}
                    <span className={`break-all ${LOG_COLOR[log.level] ?? "text-foreground/80"}`}>{log.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          {isFailed && dep.error && (
            <div className="glass rounded-xl p-4 border border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-red-400">Deployment Failed</div>
                  <div className="text-sm text-muted-foreground mt-1 font-mono">{dep.error}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Check the logs above for details. Ask AI Chat "Why did deployment v{dep.version} fail?" for an explanation.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </DashboardLayout>
    </AuthGuard>
  );
}


