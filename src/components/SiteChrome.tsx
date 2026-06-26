import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#080B12]/80 border-b border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex items-center gap-6 text-sm text-[#9CA3AF]">
            <a href="/#features" className="hover:text-[#F9FAFB] transition">Features</a>
            <a href="/#infrastructure" className="hover:text-[#F9FAFB] transition">Infrastructure</a>
            <a href="/#deployments" className="hover:text-[#F9FAFB] transition">Deployments</a>
            <Link to="/pricing" className="hover:text-[#F9FAFB] transition">Pricing</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" search={{ returnTo: "" }} className="text-sm px-4 py-2 rounded-lg text-[#9CA3AF] hover:text-[#F9FAFB] transition">Sign in</Link>
          <Link to="/signup" search={{ returnTo: "" }} className="text-sm px-4 py-2.5 rounded-lg font-medium bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080B12] shadow-lg shadow-[#00E5FF]/20 hover:brightness-110 transition">Start Free</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.04] mt-32">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <Logo />
          <p className="mt-3 text-[#6B7280] max-w-xs">AI-native DevOps platform for modern engineering teams.</p>
        </div>
        <FooterCol title="Product" items={["Features", "Infrastructure", "Deployments", "Pricing"]} />
        <FooterCol title="Developers" items={["Documentation", "API Reference", "Agent Install", "Changelog"]} />
        <FooterCol title="Company" items={["About", "Blog", "Privacy", "Terms"]} />
      </div>
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-[#6B7280] flex justify-between">
          <span>© {new Date().getFullYear()} Unwire AI. All rights reserved.</span>
          <span>Mission control for software infrastructure.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-[#F9FAFB] font-medium mb-3">{title}</h4>
      <ul className="space-y-2 text-[#6B7280]">
        {items.map((i) => (
          <li key={i}><a className="hover:text-[#F9FAFB] transition" href="#">{i}</a></li>
        ))}
      </ul>
    </div>
  );
}
