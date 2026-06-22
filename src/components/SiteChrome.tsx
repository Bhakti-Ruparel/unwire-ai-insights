import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/60 border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
          <Link to="/projects" className="hover:text-foreground transition-colors">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" search={{ returnTo: "" }} className="text-sm px-3 py-2 rounded-md text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/signup" search={{ returnTo: "" }} className="text-sm px-4 py-2 rounded-md btn-primary-grad font-medium">Get started</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-32">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <Logo />
          <p className="mt-3 text-muted-foreground max-w-xs">AI-powered codebase intelligence for modern engineering teams.</p>
        </div>
        <FooterCol title="Product" items={["Features", "Pricing", "Changelog", "Roadmap"]} />
        <FooterCol title="Company" items={["About", "Blog", "Careers", "Contact"]} />
        <FooterCol title="Legal" items={["Privacy", "Terms", "Security", "DPA"]} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Unwire AI, Inc.</span>
          <span>Built for developers, by developers.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-foreground font-medium mb-3">{title}</h4>
      <ul className="space-y-2 text-muted-foreground">
        {items.map((i) => (
          <li key={i}><a className="hover:text-foreground" href="#">{i}</a></li>
        ))}
      </ul>
    </div>
  );
}
