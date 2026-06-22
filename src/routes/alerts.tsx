import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  fetchAlerts, fetchAlertSummary, acknowledgeAlert, resolveAlertApi,
  type AlertItem, type AlertSummary,
} from "@/services/api";
import {
  AlertTriangle, ShieldAlert, CheckCircle2, Loader2,
  Clock, Server, Zap, Bell, XCircle, Eye,
} from "lucide-react";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alerts · Unwire AI" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [alertRes, sum] = await Promise.all([
        fetchAlerts({ limit: 50 }),
        fetchAlertSummary(),
      ]);
      setAlerts(alertRes.alerts);
      setSummary(sum);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleAcknowledge(id: string) {
    await acknowledgeAlert(id);
    loadData();
  }

  async function handleResolve(id: string) {
    await resolveAlertApi(id);
    loadData();
  }

  const filtered = filter === "all"
    ? alerts
    : filter === "active" ? alerts.filter((a) => a.status === "ACTIVE")
    : filter === "resolved" ? alerts.filter((a) => a.status === "RESOLVED")
    : alerts.filter((a) => a.severity === filter.toUpperCase());

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                AI-powered infrastructure monitoring and incident detection
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Monitoring {summary ? `${summary.total} active` : "..."}
              </span>
            </div>
          </div>

          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard
                icon={XCircle} label="Critical" count={summary.critical}
                color="text-red-400" bg="bg-red-500/10 border-red-500/20"
              />
              <SummaryCard
                icon={AlertTriangle} label="Warnings" count={summary.warning}
                color="text-yellow-400" bg="bg-yellow-500/10 border-yellow-500/20"
              />
              <SummaryCard
                icon={CheckCircle2} label="Resolved" count={summary.resolved}
                color="text-green-400" bg="bg-green-500/10 border-green-500/20"
              />
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {["all", "active", "CRITICAL", "WARNING", "resolved"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "glass hover:bg-secondary/60"
                }`}
              >
                {f === "all" ? "All" : f === "active" ? "Active" : f === "resolved" ? "Resolved" : f}
              </button>
            ))}
          </div>

          {/* Alerts list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <ShieldAlert className="h-10 w-10 mx-auto text-green-400 mb-3" />
              <p className="text-sm font-medium">No alerts</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your infrastructure is running smoothly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={handleAcknowledge}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

// ─── Components ───────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, count, color, bg }: {
  icon: React.ElementType; label: string; count: number; color: string; bg: string;
}) {
  return (
    <div className={`glass rounded-xl p-4 border ${bg}`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <div className={`text-2xl font-bold ${color}`}>{count}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert, onAcknowledge, onResolve }: {
  alert: AlertItem;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const severityConfig = {
    CRITICAL: { icon: XCircle, color: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5" },
    WARNING: { icon: AlertTriangle, color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/5" },
    INFO: { icon: Eye, color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/5" },
  };
  const cfg = severityConfig[alert.severity] || severityConfig.INFO;
  const Icon = cfg.icon;
  const isResolved = alert.status === "RESOLVED";

  return (
    <div className={`glass rounded-xl p-4 border ${isResolved ? "border-border/30 opacity-60" : cfg.border} ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{alert.title}</span>
            {isResolved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                Resolved
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{alert.message}</p>
          {alert.recommendation && (
            <div className="mt-2 flex items-start gap-1.5">
              <Zap className="h-3 w-3 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-primary/80">{alert.recommendation}</p>
            </div>
          )}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(alert.createdAt).toLocaleString()}
            </span>
            {alert.status === "ACTIVE" && (
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="text-[10px] px-2 py-1 rounded glass hover:bg-secondary/60 transition"
                >
                  Acknowledge
                </button>
                <button
                  onClick={() => onResolve(alert.id)}
                  className="text-[10px] px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
