import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 group">
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg btn-primary-grad">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 7h10a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h12" strokeLinecap="round" />
        </svg>
      </span>
      <span className="font-semibold tracking-tight text-foreground">
        Unwire <span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}
