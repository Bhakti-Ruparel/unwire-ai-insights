/**
 * AppLayout.tsx
 *
 * Enterprise SaaS layout with:
 * - Single global sidebar (resizable, collapsible)
 * - Top header with breadcrumbs
 * - Main content area
 * - Responsive: drawer on mobile, collapsible on tablet, fixed on desktop
 */

import { type ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";

const SIDEBAR_KEY = "unwire_sidebar_width";
const COLLAPSED_KEY = "unwire_sidebar_collapsed";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored ? parseInt(stored) : 260;
  });
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const sidebarWidth = collapsed ? 72 : width;

  return (
    <div className="h-screen flex overflow-hidden bg-[#F8FAFC]">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <div
        className={`shrink-0 h-screen transition-all duration-200 ease-in-out ${
          mobileOpen ? "fixed inset-y-0 left-0 z-50" : "hidden lg:block"
        }`}
        style={{ width: mobileOpen ? 260 : sidebarWidth }}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          width={sidebarWidth}
          onWidthChange={setWidth}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 h-screen overflow-y-auto">
        {/* Mobile header with menu button */}
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-gray-100">
            <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[#0F172A]">Unwire AI</span>
        </div>

        {children}
      </main>
    </div>
  );
}
