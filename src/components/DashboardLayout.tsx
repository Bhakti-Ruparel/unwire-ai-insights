/**
 * DashboardLayout.tsx
 *
 * Shared layout using the new enterprise AppLayout.
 * This is a compatibility wrapper — all existing pages use this.
 * Internally delegates to the new AppLayout with global sidebar.
 */

import { type ReactNode } from "react";
import { AppLayout } from "./layout/AppLayout";

interface DashboardLayoutProps {
  children: ReactNode;
  rightPanel?: ReactNode;
}

export function DashboardLayout({ children, rightPanel }: DashboardLayoutProps) {
  return (
    <AppLayout>
      <div className="flex h-full">
        <div className="flex-1 min-w-0">
          {children}
        </div>
        {rightPanel && (
          <aside className="w-[300px] h-screen border-l border-[#E2E8F0] bg-white overflow-y-auto shrink-0 hidden xl:block">
            {rightPanel}
          </aside>
        )}
      </div>
    </AppLayout>
  );
}
