import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import {
  fetchOrganization, fetchBilling, fetchApiKeys,
  inviteMember, removeMember, updateMemberRole, upgradePlan,
  createApiKeyApi, revokeApiKeyApi, createOrganization,
  type OrgData, type BillingData,
} from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import {
  Settings, Users, CreditCard, Key, Loader2,
  Plus, Trash2, Crown, UserPlus, Copy, Check,
  CheckCircle2, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Unwire AI" }] }),
  component: SettingsPage,
});

type Tab = "team" | "billing" | "keys";

// ─── Toast notification ───────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function show(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }
  return { toast, show };
}

function Toast({ toast }: { toast: { message: string; type: "success" | "error" } | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
      toast.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
    }`}>
      {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {toast.message}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

function SettingsPage() {
  const { user } = useAuth();
  const { toast, show: showToast } = useToast();
  const [tab, setTab] = useState<Tab>("team");
  const [org, setOrg] = useState<OrgData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("DEVELOPER");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadAll(); }, []);

  // Refetch when page becomes visible again (owner might have the tab open while invite is accepted)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") loadAll();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [o, b, k] = await Promise.all([
        fetchOrganization(),
        fetchBilling().catch(() => null),
        fetchApiKeys().catch(() => []),
      ]);
      setOrg(o); setBilling(b); setApiKeys(k ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    try {
      await createOrganization(newOrgName.trim());
      showToast("Organization created!");
      setNewOrgName("");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to create organization", "error"); }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    try {
      const result: any = await inviteMember(inviteEmail.trim(), inviteRole);
      if (result?.emailSent === false) {
        showToast(`Invitation created but email delivery failed. Share the link manually.`, "error");
      } else {
        showToast(`Invitation sent to ${inviteEmail.trim()}`);
      }
      setInviteEmail("");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to send invitation", "error"); }
  }

  async function handleRemove(userId: string) {
    try {
      await removeMember(userId);
      showToast("Member removed");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to remove member", "error"); }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateMemberRole(userId, role);
      showToast("Role updated");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to update role", "error"); }
  }

  async function handleUpgrade(plan: string) {
    try {
      await upgradePlan(plan);
      showToast(`Plan upgraded to ${plan}`);
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to upgrade plan", "error"); }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    try {
      const result = await createApiKeyApi(newKeyName.trim(), ["read", "write"]);
      if (result?.rawKey) {
        setNewKeyRaw(result.rawKey);
        showToast("API key created — copy it now!");
      }
      setNewKeyName("");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to create API key", "error"); }
  }

  async function handleRevokeKey(id: string) {
    try {
      await revokeApiKeyApi(id);
      showToast("API key revoked");
      loadAll();
    } catch (e: any) { showToast(e.message ?? "Failed to revoke key", "error"); }
  }

  function copyKey() {
    navigator.clipboard.writeText(newKeyRaw);
    setCopied(true);
    showToast("Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const tabs: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
    { id: "team", icon: Users, label: "Team" },
    { id: "billing", icon: CreditCard, label: "Billing" },
    { id: "keys", icon: Key, label: "API Keys" },
  ];

  return (
    <AuthGuard>
      <DashboardLayout>
        <Toast toast={toast} />
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" /> Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your organization, team, billing, and API keys.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border/40 pb-0">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !org ? (
            <div className="glass rounded-xl p-8 text-center max-w-md mx-auto">
              <Crown className="h-10 w-10 mx-auto text-primary mb-3" />
              <h2 className="text-lg font-semibold">Create your organization</h2>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Organizations let you collaborate with your team, manage billing, and share infrastructure.
              </p>
              <div className="flex gap-2">
                <input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name" className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none border border-border/40 focus:border-primary"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()} />
                <button onClick={handleCreateOrg} className="btn-primary-grad px-4 py-2 rounded-lg text-sm font-medium">Create</button>
              </div>
            </div>
          ) : (
            <>
              {tab === "team" && <TeamTab org={org} onInvite={handleInvite} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} inviteRole={inviteRole} setInviteRole={setInviteRole} onRemove={handleRemove} onRoleChange={handleRoleChange} currentUserId={user?.id ?? ""} />}
              {tab === "billing" && <BillingTab billing={billing} onUpgrade={handleUpgrade} />}
              {tab === "keys" && <KeysTab keys={apiKeys} newKeyName={newKeyName} setNewKeyName={setNewKeyName} newKeyRaw={newKeyRaw} copied={copied} onCreateKey={handleCreateKey} onRevokeKey={handleRevokeKey} onCopyKey={copyKey} />}
            </>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────

function TeamTab({ org, onInvite, inviteEmail, setInviteEmail, inviteRole, setInviteRole, onRemove, onRoleChange, currentUserId }: any) {
  const members = org.organization.members ?? [];
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4" /> Invite Member</h3>
        <div className="flex gap-2">
          <input value={inviteEmail} onChange={(e: any) => setInviteEmail(e.target.value)} placeholder="email@company.com"
            className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none border border-border/40 focus:border-primary" />
          <select value={inviteRole} onChange={(e: any) => setInviteRole(e.target.value)}
            className="bg-secondary/50 rounded-lg px-3 py-2 text-sm border border-border/40">
            <option value="ADMIN">Admin</option><option value="DEVELOPER">Developer</option><option value="VIEWER">Viewer</option>
          </select>
          <button onClick={onInvite} className="btn-primary-grad px-4 py-2 rounded-lg text-sm font-medium">Invite</button>
        </div>
      </div>
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Members ({members.length})</h3>
        <div className="space-y-2">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/30">
              <div>
                <span className="text-sm font-medium">{m.user.name || m.user.email}</span>
                <span className="text-xs text-muted-foreground ml-2">{m.user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                {m.user.id !== currentUserId ? (
                  <>
                    <select value={m.role} onChange={(e: any) => onRoleChange(m.user.id, e.target.value)}
                      className="bg-secondary/50 rounded px-2 py-1 text-xs border border-border/40">
                      <option value="OWNER">Owner</option><option value="ADMIN">Admin</option><option value="DEVELOPER">Developer</option><option value="VIEWER">Viewer</option>
                    </select>
                    <button onClick={() => onRemove(m.user.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                ) : <span className="text-xs text-primary px-2 py-0.5 rounded bg-primary/10">You</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────

function BillingTab({ billing, onUpgrade }: { billing: BillingData | null; onUpgrade: (p: string) => void }) {
  const plans = [
    { id: "free", name: "Free", price: "$0", desc: "1 server, 1 project" },
    { id: "pro", name: "Pro", price: "$29/mo", desc: "20 servers, unlimited projects" },
    { id: "enterprise", name: "Enterprise", price: "Custom", desc: "Unlimited everything" },
  ];

  if (!billing) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-xl p-6 text-center">
          <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No billing information available yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create an organization to manage your subscription.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((p) => (
            <div key={p.id} className="glass rounded-xl p-4 border border-border/40">
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-lg font-bold text-primary mt-1">{p.price}</div>
              <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2">Current Plan: <span className="text-primary capitalize">{billing.plan}</span></h3>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>Servers: <strong>{billing.usage.servers}</strong>/{billing.limits.maxServers === -1 ? "∞" : billing.limits.maxServers}</div>
          <div>Projects: <strong>{billing.usage.projects}</strong>/{billing.limits.maxProjects === -1 ? "∞" : billing.limits.maxProjects}</div>
          <div>Members: <strong>{billing.usage.members}</strong>/{billing.limits.maxMembers === -1 ? "∞" : billing.limits.maxMembers}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {plans.map((p) => (
          <div key={p.id} className={`glass rounded-xl p-4 border ${billing.plan === p.id ? "border-primary" : "border-border/40"}`}>
            <div className="text-sm font-semibold">{p.name}</div>
            <div className="text-lg font-bold text-primary mt-1">{p.price}</div>
            <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
            {billing.plan !== p.id && (
              <button onClick={() => onUpgrade(p.id)} className="mt-3 w-full text-xs py-1.5 rounded-lg glass hover:bg-primary/10 border border-primary/30 text-primary font-medium">
                {plans.indexOf(p) > plans.findIndex((x) => x.id === billing.plan) ? "Upgrade" : "Downgrade"}
              </button>
            )}
            {billing.plan === p.id && <div className="mt-3 text-xs text-center text-green-400">Current plan</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────

function KeysTab({ keys, newKeyName, setNewKeyName, newKeyRaw, copied, onCreateKey, onRevokeKey, onCopyKey }: any) {
  return (
    <div className="space-y-4">
      {newKeyRaw && (
        <div className="glass rounded-xl p-4 border border-green-500/30 bg-green-500/5">
          <p className="text-xs text-green-400 font-semibold mb-2">⚠️ This key will NOT be shown again. Copy it now.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-secondary/50 rounded px-3 py-2 overflow-x-auto select-all">{newKeyRaw}</code>
            <button onClick={onCopyKey} className="shrink-0 p-2 rounded-lg glass hover:bg-secondary/60">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Key className="h-4 w-4" /> Create API Key</h3>
        <div className="flex gap-2">
          <input value={newKeyName} onChange={(e: any) => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CI/CD Pipeline)"
            className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none border border-border/40 focus:border-primary"
            onKeyDown={(e: any) => e.key === "Enter" && onCreateKey()} />
          <button onClick={onCreateKey} className="btn-primary-grad px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />Create
          </button>
        </div>
      </div>
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Active Keys ({keys.length})</h3>
        {keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">No API keys yet. Create one to integrate with your CI/CD pipeline.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k: any) => (
              <div key={k.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/30">
                <div>
                  <span className="text-sm font-medium">{k.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{k.prefix}…</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">
                    {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}
                  </span>
                  <button onClick={() => onRevokeKey(k.id)} className="text-red-400 hover:text-red-300 text-xs font-medium">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
