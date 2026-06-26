import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import {
  ArrowRight, Server, Cloud, Cpu, Terminal, GitBranch,
  Shield, Zap, Activity, MessagesSquare, Network, Database,
  Boxes, Search, Globe, Lock, Users, BarChart3, Rocket,
  CheckCircle2, ChevronRight, Monitor, Code2, Bot,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unwire AI — Your AI DevOps Engineer" },
      { name: "description", content: "AI-powered DevOps platform: analyze code, monitor infrastructure, deploy applications, and troubleshoot incidents with one intelligent platform." },
      { property: "og:title", content: "Unwire AI — Your AI DevOps Engineer" },
      { property: "og:description", content: "Mission control for software infrastructure powered by AI." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[#080B12]">
      <SiteNav />
      <HeroSection />
      <LogoCloud />
      <AIAgentSection />
      <CodeIntelSection />
      <InfraSection />
      <MonitoringSection />
      <DeploymentSection />
      <IncidentSection />
      <PricingPreview />
      <CTASection />
      <Footer />
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────

function SiteNav() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#080B12]/80 border-b border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden lg:flex items-center gap-6 text-sm text-[#9CA3AF]">
            <a href="#features" className="hover:text-[#F9FAFB] transition">Features</a>
            <a href="#infrastructure" className="hover:text-[#F9FAFB] transition">Infrastructure</a>
            <a href="#deployments" className="hover:text-[#F9FAFB] transition">Deployments</a>
            <Link to="/pricing" className="hover:text-[#F9FAFB] transition">Pricing</Link>
            <a href="#docs" className="hover:text-[#F9FAFB] transition">Docs</a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" search={{ returnTo: "" }}
            className="text-sm px-4 py-2 rounded-lg text-[#9CA3AF] hover:text-[#F9FAFB] transition">
            Sign in
          </Link>
          <Link to="/signup" search={{ returnTo: "" }}
            className="text-sm px-4 py-2.5 rounded-lg font-medium bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080B12] hover:brightness-110 transition shadow-lg shadow-[#00E5FF]/20">
            Start Free
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-24 pb-32">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-[radial-gradient(ellipse,_#00E5FF15_0%,_transparent_70%)]" />
        <div className="absolute top-20 right-1/4 w-[600px] h-[400px] bg-[radial-gradient(ellipse,_#6366F110_0%,_transparent_70%)]" />
      </div>
      <div className="absolute inset-0 -z-10 grid-bg" />

      <div className="mx-auto max-w-7xl px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/20 bg-[#00E5FF]/5 px-4 py-1.5 text-xs text-[#00E5FF] mb-8">
          <Bot className="h-3.5 w-3.5" />
          AI-Native DevOps Platform
          <ChevronRight className="h-3 w-3" />
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-[#F9FAFB] max-w-4xl mx-auto">
          Your AI DevOps Engineer for{" "}
          <span className="bg-gradient-to-r from-[#00E5FF] to-[#6366F1] bg-clip-text text-transparent">
            Code, Cloud & Production
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-[#9CA3AF] max-w-2xl mx-auto leading-relaxed">
          Analyze your codebase, monitor infrastructure, deploy applications, and troubleshoot incidents — using one intelligent AI platform.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link to="/signup" search={{ returnTo: "" }}
            className="px-7 py-3.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080B12] shadow-lg shadow-[#00E5FF]/25 hover:brightness-110 transition inline-flex items-center gap-2">
            Start Free <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#features"
            className="px-7 py-3.5 rounded-lg font-semibold text-sm border border-white/10 text-[#F9FAFB] hover:bg-white/5 transition inline-flex items-center gap-2">
            See Features
          </a>
        </div>

        {/* Hero Visual — Infrastructure Control Center */}
        <div className="mt-20 relative max-w-5xl mx-auto">
          <div className="glass rounded-2xl p-1 border border-white/[0.08] shadow-2xl">
            <div className="bg-[#111827] rounded-xl p-6 overflow-hidden">
              <HeroTerminal />
            </div>
          </div>
          {/* Glow effect */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-[#00E5FF]/10 blur-3xl rounded-full" />
        </div>
      </div>
    </section>
  );
}

function HeroTerminal() {
  return (
    <div className="font-mono text-xs text-[#9CA3AF] space-y-2">
      <div className="flex items-center gap-2 text-[#6B7280] mb-4">
        <div className="flex gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500/60" /><div className="h-3 w-3 rounded-full bg-yellow-500/60" /><div className="h-3 w-3 rounded-full bg-green-500/60" /></div>
        <span className="ml-2">unwire-ai — mission control</span>
      </div>
      <div><span className="text-[#00E5FF]">$</span> unwire analyze --repo github.com/acme/api</div>
      <div className="text-[#22C55E]">✓ Repository analyzed: 847 files, 12 APIs, 3 databases</div>
      <div className="text-[#22C55E]">✓ Architecture mapped: Express → PostgreSQL → Redis</div>
      <div className="mt-3"><span className="text-[#00E5FF]">$</span> unwire monitor --all-servers</div>
      <div className="text-[#F9FAFB]">┌─ Production (AWS)    CPU: 34%  RAM: 61%  <span className="text-[#22C55E]">● Online</span></div>
      <div className="text-[#F9FAFB]">├─ Staging (Docker)    CPU: 12%  RAM: 28%  <span className="text-[#22C55E]">● Online</span></div>
      <div className="text-[#F9FAFB]">└─ Database (Hetzner)  CPU: 8%   RAM: 72%  <span className="text-[#F59E0B]">● Warning</span></div>
      <div className="mt-3"><span className="text-[#00E5FF]">$</span> unwire deploy --project api --branch main</div>
      <div className="text-[#6366F1]">⟳ Building Docker image...</div>
      <div className="text-[#6366F1]">⟳ Blue-green deployment in progress...</div>
      <div className="text-[#22C55E]">✓ Deployed v2.4.1 — health check passed (200ms)</div>
      <div className="mt-3"><span className="text-[#00E5FF]">AI</span> <span className="text-[#F9FAFB]">"Database RAM at 72%. The Redis cache hit ratio dropped after deployment v2.4.0. Consider increasing maxmemory."</span></div>
    </div>
  );
}

// ─── Logo Cloud ───────────────────────────────────────────────────────────

function LogoCloud() {
  const providers = ["AWS", "Azure", "Google Cloud", "DigitalOcean", "Hetzner", "Docker"];
  return (
    <section className="border-y border-white/[0.04] bg-[#080B12]/50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-center text-xs text-[#6B7280] uppercase tracking-wider mb-6">
          Works with your infrastructure
        </p>
        <div className="flex flex-wrap justify-center gap-8 md:gap-14">
          {providers.map((p) => (
            <span key={p} className="text-sm text-[#6B7280] font-medium">{p}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── AI Agent Section ─────────────────────────────────────────────────────

function AIAgentSection() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader
        badge="AI DevOps Agent"
        title="Ask questions. Get infrastructure answers."
        description="Natural language interface to your entire infrastructure. Ask about servers, deployments, logs, and incidents."
      />
      <div className="mt-14 grid lg:grid-cols-2 gap-8">
        <div className="glass rounded-2xl p-6 border border-white/[0.06]">
          <div className="space-y-4">
            {[
              { q: "Why is my production server slow?", icon: "🤔" },
              { q: "What caused the last deployment failure?", icon: "💥" },
              { q: "Which servers need attention?", icon: "🔍" },
              { q: "Analyze memory usage trend this week", icon: "📊" },
            ].map((ex) => (
              <div key={ex.q} className="flex items-center gap-3 p-3 rounded-lg bg-[#151B2B] border border-white/[0.04] hover:border-[#00E5FF]/30 transition cursor-pointer">
                <span className="text-lg">{ex.icon}</span>
                <span className="text-sm text-[#9CA3AF]">{ex.q}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-6 border border-[#6366F1]/20">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-[#6366F1]" />
            <span className="text-xs font-medium text-[#6366F1]">AI Response</span>
          </div>
          <div className="text-sm text-[#9CA3AF] leading-relaxed space-y-3">
            <p className="text-[#F9FAFB]">Production server (142.93.101.45) is experiencing elevated response times due to:</p>
            <div className="bg-[#151B2B] rounded-lg p-3 font-mono text-xs">
              <div>CPU: 89% <span className="text-[#EF4444]">↑ critical</span></div>
              <div>RAM: 73% <span className="text-[#F59E0B]">↑ warning</span></div>
              <div>Top process: node (pid 1847) — 67% CPU</div>
            </div>
            <p><strong className="text-[#F9FAFB]">Root cause:</strong> Memory leak in the connection pool introduced in deployment v2.3.</p>
            <p><strong className="text-[#F9FAFB]">Recommendation:</strong> Restart the Node.js API service and set connection pool max to 20.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Code Intelligence ────────────────────────────────────────────────────

function CodeIntelSection() {
  const features = [
    { icon: Search, title: "API Discovery", desc: "Every endpoint, method, and usage pattern auto-extracted" },
    { icon: Network, title: "Architecture Mapping", desc: "Interactive graph of your system's component relationships" },
    { icon: Database, title: "Schema Visualization", desc: "Tables, models, and relationships from your code" },
    { icon: Code2, title: "Framework Detection", desc: "Identifies runtime, build tools, and dependencies" },
    { icon: Boxes, title: "Dependency Analysis", desc: "Direct and transitive deps with vulnerability signals" },
    { icon: MessagesSquare, title: "AI Code Chat", desc: "Ask questions about your codebase with file citations" },
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Code Intelligence" title="Understand any codebase in minutes" description="Upload a repository and get complete architectural understanding powered by AI analysis and RAG." />
      <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f) => (
          <div key={f.title} className="glass rounded-xl p-5 border border-white/[0.04] hover:border-[#00E5FF]/20 transition group">
            <div className="h-10 w-10 rounded-lg bg-[#151B2B] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-[#00E5FF]/30 transition">
              <f.icon className="h-5 w-5 text-[#00E5FF]" />
            </div>
            <h3 className="font-semibold text-[#F9FAFB] text-sm">{f.title}</h3>
            <p className="mt-1.5 text-xs text-[#6B7280] leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Infrastructure Management ────────────────────────────────────────────

function InfraSection() {
  const providers = [
    { name: "AWS", desc: "EC2, RDS, Lambda" },
    { name: "Azure", desc: "VMs, App Service" },
    { name: "Google Cloud", desc: "Compute Engine, GKE" },
    { name: "DigitalOcean", desc: "Droplets, Apps" },
    { name: "Hetzner", desc: "Cloud Servers" },
    { name: "Docker", desc: "Containers" },
    { name: "Custom VPS", desc: "Any Linux server" },
  ];

  return (
    <section id="infrastructure" className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Infrastructure" title="Connect any cloud. See everything." description="Multi-cloud resource discovery with encrypted credential management and real-time sync." />
      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {providers.map((p) => (
          <div key={p.name} className="glass rounded-xl p-4 text-center border border-white/[0.04] hover:border-[#00E5FF]/20 transition">
            <Cloud className="h-6 w-6 mx-auto text-[#00E5FF]/60 mb-2" />
            <div className="text-xs font-semibold text-[#F9FAFB]">{p.name}</div>
            <div className="text-[10px] text-[#6B7280] mt-0.5">{p.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Server Monitoring ────────────────────────────────────────────────────

function MonitoringSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Monitoring" title="Deep server monitoring with a single command" description="Install the Unwire Agent and get real-time CPU, RAM, disk, network, processes, Docker containers, and logs." />
      <div className="mt-14 grid lg:grid-cols-2 gap-8">
        <div className="glass rounded-2xl p-6 border border-white/[0.06]">
          <div className="text-xs text-[#6B7280] mb-3 font-mono">Install agent</div>
          <div className="bg-[#0D1117] rounded-lg p-4 font-mono text-sm text-[#9CA3AF] overflow-x-auto">
            <div className="text-[#00E5FF]">$ curl -fsSL https://get.unwire.ai/agent | bash</div>
            <div className="text-[#22C55E] mt-1">✓ Agent installed</div>
            <div className="mt-2 text-[#00E5FF]">$ unwire-agent configure --token &lt;TOKEN&gt;</div>
            <div className="text-[#00E5FF]">$ unwire-agent start</div>
            <div className="text-[#22C55E] mt-1">✓ Connected — reporting metrics</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "CPU", value: "34%", color: "text-[#22C55E]" },
            { label: "RAM", value: "61%", color: "text-[#F59E0B]" },
            { label: "Disk", value: "45%", color: "text-[#22C55E]" },
            { label: "Network", value: "12.4 Mbps", color: "text-[#00E5FF]" },
          ].map((m) => (
            <div key={m.label} className="glass rounded-xl p-4 border border-white/[0.04]">
              <div className="text-[10px] text-[#6B7280] uppercase tracking-wider">{m.label}</div>
              <div className={`text-2xl font-bold mt-1 font-mono ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Deployment ───────────────────────────────────────────────────────────

function DeploymentSection() {
  return (
    <section id="deployments" className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Deployments" title="Push to deploy. Zero downtime." description="Connect GitHub, push code, and Unwire AI handles Docker builds, blue-green deployments, health checks, and automatic rollback." />
      <div className="mt-14 glass rounded-2xl p-8 border border-white/[0.06]">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {[
            { icon: GitBranch, label: "Push to GitHub", step: "1" },
            { icon: Rocket, label: "Build & Deploy", step: "2" },
            { icon: Activity, label: "Health Check", step: "3" },
            { icon: CheckCircle2, label: "Live", step: "4" },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-xl bg-[#151B2B] border border-white/[0.06] flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-[#00E5FF]" />
                </div>
                <span className="text-[10px] text-[#9CA3AF]">{s.label}</span>
              </div>
              {i < 3 && <ChevronRight className="h-4 w-4 text-[#6B7280]" />}
            </div>
          ))}
        </div>
        <div className="mt-8 grid md:grid-cols-3 gap-4 text-center">
          {[
            { title: "Blue-Green", desc: "Zero downtime with container switching" },
            { title: "Auto Rollback", desc: "Reverts on failed health checks" },
            { title: "Live Logs", desc: "Stream build & deploy output in real-time" },
          ].map((f) => (
            <div key={f.title} className="p-4 rounded-lg bg-[#151B2B] border border-white/[0.04]">
              <div className="text-sm font-semibold text-[#F9FAFB]">{f.title}</div>
              <div className="text-xs text-[#6B7280] mt-1">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Incident Response ────────────────────────────────────────────────────

function IncidentSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Incident Response" title="AI-powered root cause analysis" description="When issues arise, Unwire AI correlates metrics, logs, and deployments to identify the root cause automatically." />
      <div className="mt-14 glass rounded-2xl p-6 border border-[#EF4444]/20 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-[#EF4444]/10 flex items-center justify-center">
            <Activity className="h-4 w-4 text-[#EF4444]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#EF4444]">CRITICAL: CPU at 95%</div>
            <div className="text-[10px] text-[#6B7280]">Production Server · 2 minutes ago</div>
          </div>
        </div>
        <div className="border-l-2 border-[#6366F1]/30 pl-4 ml-4 space-y-3">
          <div className="text-xs text-[#9CA3AF]">
            <span className="text-[#6366F1] font-medium">AI Analysis:</span> Memory leak detected in Node.js process (pid 1847).
            Introduced after deployment v2.3.0 merged PR #142 — connection pool not releasing idle connections.
          </div>
          <div className="text-xs text-[#9CA3AF]">
            <span className="text-[#00E5FF] font-medium">Recommendation:</span> Restart service and apply fix from PR #145. Consider setting pool.max=20 and pool.idleTimeout=30000.
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing Preview ──────────────────────────────────────────────────────

function PricingPreview() {
  const plans = [
    { name: "Free", price: "₹0", period: "/forever", features: ["1 server", "1 project", "Basic AI", "Community support"], popular: false },
    { name: "Pro", price: "₹1,999", period: "/month", features: ["20 servers", "Unlimited projects", "Full AI Agent", "Deployments", "Team members"], popular: true },
    { name: "Enterprise", price: "Custom", period: "", features: ["Unlimited everything", "SSO / SAML", "Priority SLA", "Custom AI models"], popular: false },
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <SectionHeader badge="Pricing" title="Start free. Scale when you're ready." description="No credit card required. Upgrade when your infrastructure grows." />
      <div className="mt-14 grid md:grid-cols-3 gap-5">
        {plans.map((plan) => (
          <div key={plan.name} className={`glass rounded-2xl p-6 border transition ${plan.popular ? "border-[#00E5FF]/30 shadow-lg shadow-[#00E5FF]/5" : "border-white/[0.04]"}`}>
            {plan.popular && (
              <div className="text-[10px] font-medium text-[#00E5FF] uppercase tracking-wider mb-3">Most Popular</div>
            )}
            <div className="text-lg font-bold text-[#F9FAFB]">{plan.name}</div>
            <div className="mt-2">
              <span className="text-3xl font-bold text-[#F9FAFB]">{plan.price}</span>
              <span className="text-sm text-[#6B7280]">{plan.period}</span>
            </div>
            <ul className="mt-5 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] shrink-0" />{f}
                </li>
              ))}
            </ul>
            <Link to="/pricing" className={`mt-6 block text-center py-2.5 rounded-lg text-sm font-medium transition ${
              plan.popular
                ? "bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080B12] shadow-lg shadow-[#00E5FF]/20"
                : "border border-white/10 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-white/5"
            }`}>
              {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-28">
      <div className="relative glass-strong rounded-3xl p-14 text-center overflow-hidden border border-white/[0.06]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_#00E5FF08_0%,_transparent_70%)]" />
        <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight">
          Ready to simplify your DevOps?
        </h2>
        <p className="mt-4 text-[#9CA3AF] max-w-lg mx-auto">
          Join thousands of developers who replaced multiple tools with one AI-powered platform.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link to="/signup" search={{ returnTo: "" }}
            className="px-7 py-3.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-[#080B12] shadow-lg shadow-[#00E5FF]/25 hover:brightness-110 transition">
            Start Free
          </Link>
          <Link to="/pricing"
            className="px-7 py-3.5 rounded-lg font-semibold text-sm border border-white/10 text-[#F9FAFB] hover:bg-white/5 transition">
            View Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.04] mt-16">
      <div className="mx-auto max-w-7xl px-6 py-14 grid gap-8 md:grid-cols-5 text-sm">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 text-[#6B7280] max-w-xs leading-relaxed">
            AI-native DevOps platform. Analyze code, monitor infrastructure, deploy applications, resolve incidents.
          </p>
        </div>
        <FooterCol title="Product" items={[
          { label: "Features", href: "#features" },
          { label: "Infrastructure", href: "#infrastructure" },
          { label: "Deployments", href: "#deployments" },
          { label: "Pricing", href: "/pricing" },
        ]} />
        <FooterCol title="Developers" items={[
          { label: "Documentation", href: "#docs" },
          { label: "API Reference", href: "#" },
          { label: "Agent Install", href: "#" },
          { label: "Changelog", href: "#" },
        ]} />
        <FooterCol title="Company" items={[
          { label: "About", href: "#" },
          { label: "Blog", href: "#" },
          { label: "Privacy", href: "#" },
          { label: "Terms", href: "#" },
        ]} />
      </div>
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-wrap justify-between items-center text-xs text-[#6B7280]">
          <span>© {new Date().getFullYear()} Unwire AI. All rights reserved.</span>
          <span>Mission control for software infrastructure.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <h4 className="text-[#F9FAFB] font-medium mb-3">{title}</h4>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label}><a href={i.href} className="text-[#6B7280] hover:text-[#F9FAFB] transition">{i.label}</a></li>
        ))}
      </ul>
    </div>
  );
}

// ─── Shared Section Header ────────────────────────────────────────────────

function SectionHeader({ badge, title, description }: { badge: string; title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#00E5FF] font-mono font-medium mb-3">
        <Zap className="h-3 w-3" />{badge}
      </div>
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F9FAFB]">{title}</h2>
      <p className="mt-3 text-[#9CA3AF] leading-relaxed">{description}</p>
    </div>
  );
}
