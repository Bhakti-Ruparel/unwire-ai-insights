import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAdminOverview, fetchAdminUsers,
  adminSetUserStatus, adminSetUserRole, adminDeleteUser,
  type AdminOverview, type AdminUser,
} from "@/services/api";
import {
  Users, FolderOpen, Server, Cpu, Activity,
  Shield, ShieldOff, Trash2, ChevronLeft, ChevronRight,
  Search, CheckCircle2, XCircle, Database, Zap, Loader2,
  AlertCircle, BarChart3, Rocket, Clock, RefreshCw,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Unwire AI" }] }),
  component: AdminPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "text-accent" }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color?: string;
}) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
      <span>{label}</span>
      <span className={`text-xs ${ok ? "text-green-400" : "text-red-400"}`}>
        {ok ? "OK" : "Error"}
      </span>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "users" | "system";

// ─── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: AdminOverview }) {
  const successRate = data.deployments.total > 0
    ? Math.round(((data.deployments.total - data.deployments.failed) / data.deployments.total) * 100)
    : 0;
  const avgDeploy = data.deployments.avgDeploymentMs > 0
    ? `${Math.round(data.deployments.avgDeploymentMs / 1000)}s`
    : "—";

  return (
    <div className="space-y-6">
      {/* Platform stats */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-mono">Platform</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}      label="Total Users"    value={data.totalUsers}     sub="registered accounts"   color="text-blue-400" />
          <StatCard icon={FolderOpen} label="Total Projects" value={data.totalProjects}  sub="across all users"      color="text-primary" />
          <StatCard icon={Server}     label="Servers"        value={data.totalServers}   sub="connected servers"     color="text-accent" />
          <StatCard icon={Activity}   label="Active (30d)"   value={data.activeUsers30d} sub="new signups in 30 days" color="text-green-400" />
        </div>
      </div>

      {/* Usage stats */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-mono">Usage</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <StatCard icon={Zap}       label="AI Messages" value={data.aiMessages} sub="total chat messages"  color="text-purple-400" />
          <StatCard icon={BarChart3} label="Uploads"     value={data.uploads}    sub="project uploads"      color="text-yellow-400" />
        </div>
      </div>

      {/* Deployment stats */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-mono">Deployments</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Rocket}     label="Total Deploys"   value={data.deployments.total}   sub="all time"             color="text-accent" />
          <StatCard icon={CheckCircle2} label="Success Rate"  value={`${successRate}%`}         sub="of all deployments"   color="text-green-400" />
          <StatCard icon={XCircle}    label="Failed"          value={data.deployments.failed}  sub="need attention"       color="text-red-400" />
          <StatCard icon={Clock}      label="Avg Duration"    value={avgDeploy}                 sub="per deployment"       color="text-blue-400" />
        </div>
        {data.deployments.running > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-blue-400 glass rounded-xl px-4 py-3 border border-blue-500/20">
            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
            <span>{data.deployments.running} deployment{data.deployments.running !== 1 ? "s" : ""} currently running</span>
          </div>
        )}
      </div>

      {/* System status */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-accent" /> System Status
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <StatusDot ok={data.system.dbStatus === "ok"}             label="Database" />
          <StatusDot ok={data.system.queueStatus === "ok"}          label="Job Queue" />
          <StatusDot ok={data.system.aiStatus === "configured"}     label="OpenAI API" />
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────

function UsersTab() {
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminUsers({ page, limit: 20, search: search || undefined, role: roleFilter || undefined });
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error("Failed to load users."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, roleFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  async function handleToggle(u: AdminUser) {
    try {
      await adminSetUserStatus(u.id, !u.isActive);
      toast.success(`User ${u.isActive ? "disabled" : "enabled"}`);
      load();
    } catch { toast.error("Failed to update user."); }
  }

  async function handleRoleToggle(u: AdminUser) {
    const newRole = u.role === "ADMIN" ? "USER" : "ADMIN";
    try {
      await adminSetUserRole(u.id, newRole);
      toast.success(`Role changed to ${newRole}`);
      load();
    } catch { toast.error("Failed to change role."); }
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    try {
      await adminDeleteUser(u.id);
      toast.success("User deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-secondary/40 border border-border rounded-lg outline-none focus:border-primary transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="bg-secondary/40 border border-border rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="">All roles</option>
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
        <span className="text-sm text-muted-foreground">{total} users</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-3 justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading…</span>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Role</th>
                <th className="text-center px-4 py-3 hidden sm:table-cell">Projects</th>
                <th className="text-center px-4 py-3 hidden lg:table-cell">Servers</th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">Joined</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded border font-mono ${
                      u.role === "ADMIN"
                        ? "text-primary border-primary/30 bg-primary/10"
                        : "text-muted-foreground border-border bg-secondary/30"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell text-muted-foreground">{u.projectCount}</td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell text-muted-foreground">{u.serverCount}</td>
                  <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.isActive
                      ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                      : <XCircle    className="h-4 w-4 text-red-400 mx-auto"   />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggle(u)}
                        title={u.isActive ? "Disable" : "Enable"}
                        className={`h-7 w-7 rounded flex items-center justify-center transition ${
                          u.isActive ? "text-yellow-400 hover:bg-yellow-500/10" : "text-green-400 hover:bg-green-500/10"
                        }`}
                      >
                        {u.isActive ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleRoleToggle(u)}
                        title={u.role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
                        className="h-7 w-7 rounded flex items-center justify-center text-blue-400 hover:bg-blue-500/10 transition"
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        title="Delete user"
                        className="h-7 w-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 rounded border border-border flex items-center justify-center disabled:opacity-40 hover:bg-secondary/40 transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 rounded border border-border flex items-center justify-center disabled:opacity-40 hover:bg-secondary/40 transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── System Tab ──────────────────────────────────────────────────────────

function SystemTab({ data }: { data: AdminOverview }) {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold">Service Health</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "PostgreSQL Database",  ok: data.system.dbStatus === "ok",             icon: Database },
            { label: "Background Job Queue", ok: data.system.queueStatus === "ok",          icon: Zap      },
            { label: "OpenAI API",           ok: data.system.aiStatus === "configured",     icon: Zap      },
            { label: "API Server",           ok: true,                                       icon: Server   },
          ].map(({ label, ok, icon: Icon }) => (
            <div key={label} className={`flex items-center gap-3 p-4 rounded-xl border ${
              ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
            }`}>
              <Icon className={`h-5 w-5 ${ok ? "text-green-400" : "text-red-400"}`} />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className={`text-xs ${ok ? "text-green-400" : "text-red-400"}`}>
                  {ok ? "Operational" : "Error"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="text-sm font-semibold mb-4">Configuration</h3>
        <div className="space-y-2 font-mono text-xs">
          {[
            { key: "Node Environment", val: "production" },
            { key: "OpenAI Model",     val: "gpt-4o-mini" },
            { key: "Embeddings Model", val: "text-embedding-3-small" },
            { key: "JWT Expiry",       val: "15 minutes (access) / 30 days (refresh)" },
            { key: "Max Upload Size",  val: "200 MB" },
          ].map(({ key, val }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-muted-foreground">{key}</span>
              <span>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("overview");

  // Guard — redirect non-admins
  useEffect(() => {
    if (!authLoading && user && !isAdmin) navigate({ to: "/projects" });
    if (!authLoading && !user) navigate({ to: "/login", search: { returnTo: "/admin" } });
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    fetchAdminOverview()
      .then(setOverview)
      .catch(() => toast.error("Failed to load admin data."))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
          <Loader2 className="h-6 w-6 animate-spin" /><span>Loading admin panel…</span>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "users",    label: "Users",    icon: Users     },
    { key: "system",   label: "System",   icon: Cpu       },
  ];

  return (
    <DashboardLayout>
      <Toaster theme="dark" position="bottom-right" />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-muted-foreground text-sm">Manage users, monitor system health, track usage.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 glass rounded-xl w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-secondary/80 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "overview" && overview && <OverviewTab data={overview} />}
        {tab === "users"    && <UsersTab />}
        {tab === "system"   && overview && <SystemTab data={overview} />}
      </main>
    </DashboardLayout>
  );
}
