import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  Terminal, Search, Play, Clock, CheckCircle2, XCircle, Loader2,
  AlertTriangle, ChevronLeft, Copy,
} from "lucide-react";
import { toast, Toaster } from "sonner";

const API = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:5000";

export const Route = createFileRoute("/server-commands/$serverId")({
  head: () => ({ meta: [{ title: "Command Center · Unwire AI" }] }),
  component: CommandCenter,
});

interface Cmd { id: string; name: string; description: string; category: string; riskLevel: string; requiresConfirmation: boolean; icon?: string; params?: Array<{ name: string; label: string; placeholder: string; required: boolean }>; }
interface Exec { id: string; commandId: string; commandName: string; command: string; status: string; stdout: string; stderr: string; exitCode: number | null; durationMs: number | null; completedAt: string | null; }

function CommandCenter() {
  const { serverId } = useParams({ from: "/server-commands/$serverId" });
  const [commands, setCommands] = useState<Cmd[]>([]);
  const [history, setHistory] = useState<Exec[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [running, setRunning] = useState<string | null>(null);
  const [output, setOutput] = useState<Exec | null>(null);
  const [paramModal, setParamModal] = useState<Cmd | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("unwire_access_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const org = localStorage.getItem("unwire_active_org");
  if (org) headers["X-Organization-Id"] = org;

  const loadData = useCallback(async () => {
    const [regRes, histRes] = await Promise.all([
      fetch(`${API}/api/commands/servers/${serverId}/available`, { headers }).then(r => r.json()),
      fetch(`${API}/api/commands/servers/${serverId}/history?limit=10`, { headers }).then(r => r.json()),
    ]);
    setCommands(regRes.data?.commands ?? []);
    setHistory(histRes.data ?? []);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function runCommand(cmdId: string, params?: Record<string, string>) {
    const cmd = commands.find(c => c.id === cmdId);
    if (!cmd) return;
    if (cmd.requiresConfirmation && !confirm(`Execute "${cmd.name}"? This is a ${cmd.riskLevel}-risk action.`)) return;
    if (cmd.params?.length && !params) { setParamModal(cmd); setParamValues({}); return; }

    setRunning(cmdId);
    setOutput(null);
    try {
      const res = await fetch(`${API}/api/commands/servers/${serverId}/execute`, {
        method: "POST", headers, body: JSON.stringify({ commandId: cmdId, params }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      // Poll for result
      const execId = json.data.id;
      pollResult(execId);
    } catch (err: any) {
      toast.error(err.message ?? "Execution failed.");
      setRunning(null);
    }
  }

  async function pollResult(execId: string) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch(`${API}/api/commands/executions/${execId}`, { headers });
        const json = await res.json();
        if (json.data?.status === "success" || json.data?.status === "failed") {
          setOutput(json.data);
          setRunning(null);
          loadData();
          return;
        }
      } catch { break; }
    }
    setRunning(null);
    toast.error("Command timed out.");
  }

  const filtered = commands.filter(c => {
    if (category !== "all" && c.category !== category) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.includes(q);
  });

  const categories = [...new Set(commands.map(c => c.category))];

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <Link to="/servers/$serverId" params={{ serverId }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
                <ChevronLeft className="h-3 w-3" /> Back to Server
              </Link>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Terminal className="h-6 w-6 text-primary" /> Command Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Execute predefined operations on your server — no SSH needed.</p>
            </div>
          </div>

          {/* Search + Categories */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search commands..."
                className="w-full pl-9 pr-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <CatBtn active={category === "all"} onClick={() => setCategory("all")}>All</CatBtn>
              {categories.map(c => <CatBtn key={c} active={category === c} onClick={() => setCategory(c)}>{c}</CatBtn>)}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_400px] gap-6">
            {/* Command Grid */}
            <div className="space-y-3">
              {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
                filtered.map(cmd => (
                  <div key={cmd.id} className="glass rounded-xl p-4 border border-border/40 hover:border-primary/30 transition flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{cmd.icon ?? "⚡"}</span>
                      <div>
                        <div className="text-sm font-medium">{cmd.name}</div>
                        <div className="text-[10px] text-muted-foreground">{cmd.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={cmd.riskLevel} />
                      <button onClick={() => runCommand(cmd.id)} disabled={running === cmd.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium btn-primary-grad opacity-80 group-hover:opacity-100 transition disabled:opacity-40 flex items-center gap-1">
                        {running === cmd.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Run
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Output + History */}
            <div className="space-y-4">
              {/* Live Output */}
              {(output || running) && (
                <div className="glass rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                    <span className="text-xs font-medium">Output</span>
                    {output && <StatusBadge status={output.status} />}
                    {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  </div>
                  <div className="p-3 bg-[#0d1117] font-mono text-xs text-[#9CA3AF] max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                    {running && !output && <span className="text-yellow-400">Executing...</span>}
                    {output?.stdout && <div className="text-[#F9FAFB]">{output.stdout}</div>}
                    {output?.stderr && <div className="text-red-400 mt-1">{output.stderr}</div>}
                    {output?.exitCode !== null && output?.exitCode !== undefined && (
                      <div className={`mt-2 ${output.exitCode === 0 ? "text-green-400" : "text-red-400"}`}>
                        Exit code: {output.exitCode} ({output.durationMs}ms)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History */}
              <div className="glass rounded-xl border border-border/40">
                <div className="px-4 py-2.5 border-b border-border/40">
                  <span className="text-xs font-medium flex items-center gap-1.5"><Clock className="h-3 w-3" /> Recent History</span>
                </div>
                <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                  {history.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">No commands executed yet.</div>}
                  {history.map(h => (
                    <button key={h.id} onClick={() => setOutput(h)} className="w-full px-4 py-2.5 text-left hover:bg-secondary/20 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{h.commandName}</span>
                        <StatusBadge status={h.status} />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{h.command}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Parameter Modal */}
        {paramModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setParamModal(null)}>
            <div className="glass-strong rounded-2xl p-6 w-full max-w-sm border border-border" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-4">{paramModal.name}</h3>
              <div className="space-y-3">
                {paramModal.params?.map(p => (
                  <label key={p.name} className="block">
                    <span className="text-xs text-muted-foreground">{p.label}</span>
                    <input value={paramValues[p.name] ?? ""} onChange={e => setParamValues({ ...paramValues, [p.name]: e.target.value })}
                      placeholder={p.placeholder} className="w-full mt-1 px-3 py-2 bg-secondary/40 border border-border rounded-lg text-sm outline-none focus:border-primary" />
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setParamModal(null)} className="flex-1 px-3 py-2 rounded-lg glass text-sm">Cancel</button>
                <button onClick={() => { runCommand(paramModal.id, paramValues); setParamModal(null); }} className="flex-1 px-3 py-2 rounded-lg btn-primary-grad text-sm font-medium">Execute</button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}

function CatBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${active ? "bg-primary/10 text-primary border border-primary/30" : "glass text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}

function RiskBadge({ level }: { level: string }) {
  const colors = { low: "text-green-400 bg-green-500/10", medium: "text-yellow-400 bg-yellow-500/10", high: "text-red-400 bg-red-500/10" };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors[level as keyof typeof colors] ?? colors.low}`}>{level}</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <span className="text-[9px] text-green-400 flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />success</span>;
  if (status === "failed") return <span className="text-[9px] text-red-400 flex items-center gap-0.5"><XCircle className="h-2.5 w-2.5" />failed</span>;
  return <span className="text-[9px] text-yellow-400 flex items-center gap-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin" />running</span>;
}
