/**
 * Sidebar.tsx
 *
 * Global navigation sidebar — single instance across entire app.
 * Resizable via drag handle. Collapsible to icon-only mode.
 * Light enterprise theme.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { useState, useRef, useCallback } from "react";
import {
  LayoutDashboard, FolderOpen, Server, Rocket, Activity,
  Bell, MessagesSquare, Settings, ChevronLeft, ChevronRight,
  Cloud, LogOut, User, Building2, ChevronsLeftRight,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

const NAV_ITEMS = [
  { to: "/overview", icon: LayoutDashboard, label: "Overview", match: "/overview" },
  { to: "/projects", icon: FolderOpen, label: "Projects", match: "/projects" },
  { to: "/servers", icon: Server, label: "Servers", match: "/servers" },
  { to: "/infrastructure", icon: Cloud, label: "Infrastructure", match: "/infrastructure" },
  { to: "/deployments", icon: Rocket, label: "Deployments", match: "/deployments" },
  { to: "/monitoring", icon: Activity, label: "Monitoring", match: "/monitoring" },
  { to: "/alerts", icon: Bell, label: "Alerts", match: "/alerts" },
  { to: "/assistant", icon: MessagesSquare, label: "AI Assistant", match: "/assistant" },
  { to: "/settings", icon: Settings, label: "Settings", match: "/settings" },
];

export function Sidebar({ collapsed, onToggle, width, onWidthChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initials = user?.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  const dragRef = useRef<boolean>(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    dragRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const newWidth = Math.max(200, Math.min(360, startWidth + (e.clientX - startX)));
      onWidthChange(newWidth);
    };
    const onMouseUp = () => {
      dragRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [collapsed, width, onWidthChange]);

  return (
    <aside className="h-full bg-white border-r border-[#E2E8F0] flex flex-col relative select-none">
      {/* Logo + Collapse */}
      <div className="px-4 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-xs font-bold">U</div>
            <span className="text-sm font-semibold text-[#0F172A]">Unwire AI</span>
          </div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.match);
          return (
            <Link key={item.label} to={item.to as any}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
                active
                  ? "bg-[#2563EB]/10 text-[#2563EB] font-medium"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-gray-50"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#2563EB]" : ""}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-3 border-t border-[#E2E8F0]">
        <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition ${collapsed ? "justify-center" : ""}`}>
          <div className="h-8 w-8 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#0F172A] truncate">{user?.name ?? "User"}</div>
              <div className="text-[10px] text-[#94A3B8] truncate">{user?.email}</div>
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#2563EB]/20 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}
    </aside>
  );
}
