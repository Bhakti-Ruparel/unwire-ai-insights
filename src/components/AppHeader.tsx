import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Bell, Settings } from "lucide-react";

export function AppHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/projects", label: "Projects" },
    { to: "/docs", label: "Documentation" },
    { to: "/settings", label: "Settings" },
  ];
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo to="/projects" />
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {items.map((i) => {
              const active = pathname.startsWith(i.to);
              return (
                <Link
                  key={i.to}
                  to={i.to}
                  className={`px-3 py-1.5 rounded-md transition-colors ${active ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {i.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-md hover:bg-secondary/40 text-muted-foreground"><Bell className="h-4 w-4" /></button>
          <button className="p-2 rounded-md hover:bg-secondary/40 text-muted-foreground"><Settings className="h-4 w-4" /></button>
          <div className="h-8 w-8 rounded-full btn-primary-grad flex items-center justify-center text-xs font-semibold">AD</div>
        </div>
      </div>
    </header>
  );
}
