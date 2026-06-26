import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import {
  fetchProfile, updateProfile, fetchSessions, logoutAllSessions,
  type UserProfile,
} from "@/services/api";
import {
  User, Mail, Building2, Calendar, Shield, Globe, Loader2,
  Save, LogOut, Monitor, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile · Unwire AI" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", bio: "" });
  const [sessions, setSessions] = useState<Array<{ id: string; userAgent: string; ipAddress: string; createdAt: string }>>([]);
  const [tab, setTab] = useState<"profile" | "security">("profile");

  useEffect(() => {
    loadProfile();
    loadSessions();
  }, []);

  async function loadProfile() {
    setLoading(true);
    const p = await fetchProfile();
    if (p) {
      setProfile(p);
      setForm({ name: p.name, company: p.company, bio: p.bio });
    }
    setLoading(false);
  }

  async function loadSessions() {
    const s = await fetchSessions();
    setSessions(s);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      toast.success("Profile updated!");
      refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
    setSaving(false);
  }

  async function handleLogoutAll() {
    if (!confirm("This will sign you out of all devices. Continue?")) return;
    try {
      await logoutAllSessions();
      toast.success("All sessions invalidated. Logging out...");
      setTimeout(() => logout(), 1500);
    } catch {
      toast.error("Failed to invalidate sessions.");
    }
  }

  const initials = profile?.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  if (loading) return (
    <AuthGuard><DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading profile...</span>
      </div>
    </DashboardLayout></AuthGuard>
  );

  return (
    <AuthGuard>
      <Toaster theme="dark" position="bottom-right" />
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full btn-primary-grad flex items-center justify-center text-xl font-bold shrink-0">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{profile?.name || "User"}</h1>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {profile?.organizations?.[0] && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {profile.organizations[0].name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> {profile?.organizations?.[0]?.role ?? profile?.role}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Joined {new Date(profile?.createdAt ?? "").toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["profile", "security"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium transition border-b-2 ${
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {t === "profile" ? "Profile" : "Security"}
              </button>
            ))}
          </div>

          {tab === "profile" ? (
            <ProfileTab form={form} setForm={setForm} saving={saving} onSave={handleSave} profile={profile} />
          ) : (
            <SecurityTab sessions={sessions} onLogoutAll={handleLogoutAll} />
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────

function ProfileTab({ form, setForm, saving, onSave, profile }: {
  form: { name: string; company: string; bio: string };
  setForm: (f: any) => void;
  saving: boolean;
  onSave: (e: React.FormEvent) => void;
  profile: UserProfile | null;
}) {
  const inp = "w-full bg-secondary/40 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition";

  return (
    <form onSubmit={onSave} className="space-y-6">
      {/* Personal Info */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" /> Personal Information
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Full Name</span>
            <input className={inp} value={form.name} maxLength={100}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Email</span>
            <input className={`${inp} opacity-60 cursor-not-allowed`} value={profile?.email ?? ""} disabled />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Company</span>
            <input className={inp} value={form.company} maxLength={100}
              onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name (optional)" />
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground block mb-1.5">Role</span>
            <input className={`${inp} opacity-60 cursor-not-allowed`} value={profile?.organizations?.[0]?.role ?? profile?.role ?? ""} disabled />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-muted-foreground block mb-1.5">Bio</span>
          <textarea className={`${inp} h-20 resize-none`} value={form.bio} maxLength={500}
            onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A short bio (optional)" />
        </label>
      </div>

      {/* Stats */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Account Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <Stat label="Projects" value={profile?.projectCount ?? 0} />
          <Stat label="Servers" value={profile?.serverCount ?? 0} />
          <Stat label="Organizations" value={profile?.organizations?.length ?? 0} />
          <Stat label="Plan" value={profile?.organizations?.[0]?.plan?.toUpperCase() ?? "FREE"} />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button type="submit" disabled={saving}
          className="btn-primary-grad px-5 py-2.5 rounded-lg font-medium text-sm inline-flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-lg p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────

function SecurityTab({ sessions, onLogoutAll }: {
  sessions: Array<{ id: string; userAgent: string; ipAddress: string; createdAt: string }>;
  onLogoutAll: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" /> Active Sessions ({sessions.length})
          </h3>
          <button onClick={onLogoutAll}
            className="text-xs px-3 py-1.5 rounded-lg glass border border-red-500/20 text-red-400 hover:bg-red-500/10 transition inline-flex items-center gap-1.5">
            <LogOut className="h-3 w-3" /> Logout All Devices
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/40">
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs font-medium truncate max-w-[300px]">
                      {parseUserAgent(s.userAgent)}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>{s.ipAddress || "Unknown IP"}</span>
                      <span>·</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                {i === 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    Current
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Info */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-muted-foreground" /> Security
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span className="text-xs">Password authentication</span>
            </div>
            <span className="text-[10px] text-green-400">Active</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-xs">Two-factor authentication</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Not enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseUserAgent(ua: string): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Chrome")) return "Chrome Browser";
  if (ua.includes("Firefox")) return "Firefox Browser";
  if (ua.includes("Safari")) return "Safari Browser";
  if (ua.includes("Edge")) return "Edge Browser";
  return ua.slice(0, 50);
}
