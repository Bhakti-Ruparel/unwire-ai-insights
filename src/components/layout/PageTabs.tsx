/**
 * PageTabs.tsx
 *
 * Reusable tab navigation component for server/project detail pages.
 * Uses router-based navigation (not state-based conditional rendering).
 */

import { Link, useRouterState } from "@tanstack/react-router";

export interface Tab {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface PageTabsProps {
  tabs: Tab[];
}

export function PageTabs({ tabs }: PageTabsProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="border-b border-[#E2E8F0] bg-white">
      <div className="max-w-[1400px] mx-auto px-6">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link key={tab.href} to={tab.href as any}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]"
                }`}>
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/**
 * PageHeader — used for server/project detail page headers.
 */
export function PageHeader({ title, subtitle, status, children }: {
  title: string;
  subtitle?: string;
  status?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border-b border-[#E2E8F0]">
      <div className="max-w-[1400px] mx-auto px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[#0F172A]">{title}</h1>
              {status}
            </div>
            {subtitle && <p className="text-sm text-[#64748B] mt-0.5">{subtitle}</p>}
          </div>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * StatusBadge — inline status indicator
 */
export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-green-100 text-green-700 border-green-200",
    offline: "bg-red-100 text-red-700 border-red-200",
    degraded: "bg-yellow-100 text-yellow-700 border-yellow-200",
    unknown: "bg-gray-100 text-gray-600 border-gray-200",
    running: "bg-green-100 text-green-700 border-green-200",
  };

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${colors[status] ?? colors.unknown}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
