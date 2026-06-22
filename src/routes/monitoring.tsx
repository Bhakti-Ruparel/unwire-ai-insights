import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { fetchServers } from "@/services/api";
import type { Server } from "@/types/project";
import {
  Cpu, MemoryStick, HardDrive, Activity, AlertTriangle,
  CheckCircle2, Loader2, Network, Zap, TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring · Unwire AI" }] }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServers().then(setServers).finally(() => setLoading(false));
  }, []);

  const hasMetrics = servers.some(s => s.latestMetric);
  const avgCpu = hasMetrics ? servers.reduce((s, sv) => s + (sv.latestMetric?.cpuPercent ?? 0), 0) / Math.max(1, servers.filter(s => s.latestMetric).length) : 0;
  const avgRam = hasMetrics ? servers.reduce((s, sv) => s + (sv.latestMetric?.ramPercent ?? 0), 0) / Math.max(1, servers.filter(s => s.latestMetric).length) : 0;
  const avgDisk = hasMetrics ? servers.reduce((s, sv) => s + (sv.latestMetric?.diskPercent ?? 0), 0) / Math.max(1, servers.filter(s => s.latestMetric).length) : 0;

  const rightPanel = (
    <div className="p-4 space-y-4">
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Zap className="h-3 w-3" />AI Recommendations
        </div>
        {hasMetrics ? (
          <div className="space-y-3">
            {avgRam > 70 && <p className="text-xs text-yellow-400">⚠ Average RAM usage is high ({avgRam.toFixed(0)}%). Consider scaling.</p>}
            {avgCpu > 70 && <p className="text-xs text-yellow-400">⚠ CPU pressure detected across servers.</p>}
            {avgRam <= 70 && avgCpu <= 70 && <p className="text-xs text-green-400">✓ All resource levels are healthy.</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60">Connect a server to receive AI monitoring recommendations.</p>
        )}
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alert Summary</div>
        <div className="flex items-center gap-2 text-xs text-green-400/70">
          <CheckCircle2 className="h-3.5 w-3.5" />No active alerts
        </div>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <DashboardLayout rightPanel={rightPanel}>
        <div className="max-w-[1000px] mx-auto px-6 py-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold">Monitoring</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Central infrastructure health monitoring</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading metrics…</span>
            </div>
          ) : (
            <>
              {/* Resource overview */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Avg CPU",  value: hasMetrics ? `${avgCpu.toFixed(0)}%` : "—", icon: Cpu, color: avgCpu > 75 ? "text-red-400" : avgCpu > 50 ? "text-yellow-400" : "text-green-400" },
                  { label: "Avg RAM",  value: hasMetrics ? `${avgRam.toFixed(0)}%` : "—", icon: MemoryStick, color: avgRam > 75 ? "text-red-400" : avgRam > 50 ? "text-yellow-400" : "text-green-400" },
                  { label: "Avg Disk", value: hasMetrics ? `${avgDisk.toFixed(0)}%` : "—", icon: HardDrive, color: avgDisk > 80 ? "text-red-400" : "text-green-400" },
                  { label: "Servers",  value: `${servers.filter(s => s.status === "online").length}/${servers.length}`, icon: Activity, color: "text-blue-400" },
                ].map((m) => (
                  <div key={m.label} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</span>
                    </div>
                    <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Server health list */}
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-semibold mb-4">Server Health</div>
                {servers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    No servers connected. Add a server to start monitoring.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {servers.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/10 transition">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.status === "online" ? "bg-green-400" : "bg-gray-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.name}</div>
                          <div className="text-[10px] text-muted-foreground">{s.host} · {s.provider}</div>
                        </div>
                        {s.latestMetric && (
                          <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                            <span>CPU {s.latestMetric.cpuPercent.toFixed(0)}%</span>
                            <span>RAM {s.latestMetric.ramPercent.toFixed(0)}%</span>
                          </div>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === "online" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alerts */}
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />Active Alerts
                </div>
                <div className="flex items-center gap-2 text-sm text-green-400/70 py-4 justify-center">
                  <CheckCircle2 className="h-4 w-4" />No critical issues detected
                </div>
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
