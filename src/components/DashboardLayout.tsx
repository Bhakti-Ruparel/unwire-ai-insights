/**
 * DashboardLayout.tsx
 *
 * Shared 3-panel layout used across all main SaaS pages.
 * Left sidebar (fixed) | Center content (scrollable) | Optional right panel (fixed)
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, FolderOpen, Server, Rocket, Activity,
  MonitorCheck, MessagesSquare, Clock, Shield, Settings,
  Users, Building2, Bell, LogOut, ChevronDown,
} from "lucide-react";
import { type ReactNode } from "react";
import { GlobalAIAgent } from "@/components/GlobalAIAgent";

// ─── Navigation config ────────────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: React.ElementType;
  name: string;
  match?: string; // path prefix to determine active state
}

const MAIN_NAV: NavItem[] = [
  { to: "/overview",     icon: LayoutDashboard, name: "Overview",      match: "/overview" },
  { to: "/projects",     icon: FolderOpen,      name: "Projects",      match: "/projects" },
  { to: "/servers",      icon: Server,          name: "Servers",       match: "/servers" },
  { to: "/deployments",  icon: Rocket,          name: "Deployments",   match: "/deployments" },
  { to: "/monitoring",   icon: MonitorCheck,    name: "Monitoring",    match: "/monitoring" },
  { to: "/alerts",       icon: Bell,            name: "Alerts",        match: "/alerts" },
  { to: "/assistant",    icon: MessagesSquare,  name: "AI Assistant",  match: "/assistant" },
  { to: "/activity",     icon: Clock,           name: "Activity",      match: "/activity" },
  { to: "/settings",     icon: Settings,        name: "Settings",      match: "/settings" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", icon: Users,     name: "Users",        match: "/admin" },
  { to: "/admin", icon: Building2, name: "Organizations" },
];

// ─── Sidebar Component ────────────────────────────────────────────────────

function DashboardSidebar() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = user?.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  function isActive(item: NavItem): boolean {
    if (item.match) return pathname.startsWith(item.match);
    return pathname === item.to;
  }

  return (
    <aside className="w-[220px] h-screen bg-[oklch(0.11_0.01_265)] border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono ml-1">BETA</span>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {MAIN_NAV.map((item) => (
          <Link key={item.name} to={item.to as any}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
              isActive(item)
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.name}
          </Link>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-2">
              <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Admin</div>
            </div>
            {ADMIN_NAV.map((item) => (
              <Link key={item.name} to={item.to as any}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                  isActive(item)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            ))}
          </>
        )}

        {/* Settings */}
        <div className="pt-3">
          <Link to={"/projects" as any}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-all"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-border/40">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-secondary/20 transition cursor-pointer">
          <div className="h-8 w-8 rounded-full btn-primary-grad flex items-center justify-center text-[11px] font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{user?.name ?? "User"}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Layout Export ────────────────────────────────────────────────────────

interface DashboardLayoutProps {
  children: ReactNode;
  rightPanel?: ReactNode;
}

export function DashboardLayout({ children, rightPanel }: DashboardLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <DashboardSidebar />
      <main className="flex-1 h-screen overflow-y-auto">
        {children}
      </main>
      {rightPanel && (
        <aside className="w-[300px] h-screen border-l border-border bg-[oklch(0.11_0.01_265)] overflow-y-auto shrink-0">
          {rightPanel}
        </aside>
      )}
      <GlobalAIAgent />
    </div>
  );
}
