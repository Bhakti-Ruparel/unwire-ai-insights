import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Bell, Settings, LogOut, Shield, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useState, useRef, useEffect } from "react";

export function AppHeader() {
  const pathname   = useRouterState({ select: (s) => s.location.pathname });
  const navigate   = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navItems = [
    { to: "/projects", label: "Projects" },
    { to: "/servers",  label: "Servers"  },
  ];

  async function handleLogout() {
    await logout();
    navigate({ to: "/login", search: { returnTo: "" } });
  }

  // Avatar initials
  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">

        {/* Left: logo + nav */}
        <div className="flex items-center gap-8">
          <Logo to="/projects" />
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    active ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  pathname.startsWith("/admin") ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Right: actions + user menu */}
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-md hover:bg-secondary/40 text-muted-foreground">
            <Bell className="h-4 w-4" />
          </button>

          {/* User dropdown */}
          {user ? (
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/40 transition"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full btn-primary-grad flex items-center justify-center text-xs font-semibold shrink-0">
                    {initials}
                  </div>
                )}
                <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">
                  {user.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              </button>

              {dropOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 glass rounded-xl border border-border shadow-xl overflow-hidden z-50">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-border">
                    <div className="font-medium text-sm truncate">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    {user.role === "ADMIN" && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded">
                        <Shield className="h-2.5 w-2.5" /> ADMIN
                      </span>
                    )}
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setDropOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-secondary/40 transition"
                      >
                        <Shield className="h-4 w-4 text-primary" />
                        Admin Dashboard
                      </Link>
                    )}
                    <button
                      onClick={() => setDropOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-secondary/40 transition"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Settings
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                      onClick={() => { setDropOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" search={{ returnTo: "" }} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-secondary/40 transition">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
