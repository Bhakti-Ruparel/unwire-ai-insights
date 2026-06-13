import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import {
  Upload, Cpu, MessagesSquare, Network, Server, Database, Boxes, Sparkles, ArrowRight, Github, Zap, Search,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unwire AI — Understand Any Codebase Instantly" },
      { name: "description", content: "Upload your project and let AI map your architecture, APIs, backend, dependencies, and answer questions about your code." },
      { property: "og:title", content: "Unwire AI — Understand Any Codebase Instantly" },
      { property: "og:description", content: "AI-powered codebase intelligence: architecture, API maps, dependency graphs, and a RAG chatbot over your repo." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ backgroundImage: "var(--gradient-hero)" }} />
        <div className="absolute inset-0 -z-10 grid-bg" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              New · RAG chatbot over your entire repo
            </div>
            <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
              Understand any <span className="text-gradient">codebase</span> instantly.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Upload your project and let AI map your architecture, APIs, backend, dependencies — and answer any question about your code.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/projects" className="btn-primary-grad px-5 py-3 rounded-md font-medium inline-flex items-center gap-2">
                Unwire My Project <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="glass px-5 py-3 rounded-md font-medium inline-flex items-center gap-2 hover:bg-secondary/40 transition-colors">
                View Demo
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><Github className="h-4 w-4" /> Connect GitHub</div>
              <div className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload ZIP</div>
              <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Analyzed in seconds</div>
            </div>
          </div>
          <div className="relative">
            <ArchitectureDiagram />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader eyebrow="How it works" title="From repo to insight in three steps" />
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {[
            { icon: Upload, title: "1. Upload project", body: "Drop a ZIP or paste a GitHub URL. Public or private — your code stays yours." },
            { icon: Cpu, title: "2. AI analyzes code", body: "We parse files, detect frameworks, extract APIs and build a vector index of your codebase." },
            { icon: MessagesSquare, title: "3. Explore & chat", body: "Open the dashboard or ask questions in natural language with cited source files." },
          ].map((s) => (
            <div key={s.title} className="glass rounded-2xl p-6">
              <s.icon className="h-6 w-6 text-accent" />
              <h3 className="mt-4 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader eyebrow="Features" title="Everything you need to grok a codebase" />
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Search, title: "API Discovery", body: "Every endpoint, method, caller and usage count — auto-extracted." },
            { icon: Network, title: "Architecture Mapping", body: "Interactive graph of frontend → API → backend → data → external services." },
            { icon: Server, title: "Backend Understanding", body: "Routes, controllers, middleware, and auth flows explained in plain English." },
            { icon: Boxes, title: "Dependency Analysis", body: "Direct and transitive dependencies with vulnerability and usage signals." },
            { icon: Database, title: "Schema Visualization", body: "Tables, models and relationships pulled straight from your code." },
            { icon: MessagesSquare, title: "AI Codebase Chat", body: 'Ask "where is auth implemented?" — get answers with file citations.' },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 hover:bg-secondary/30 transition-colors">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/60 border border-border">
                <f.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeader eyebrow="Loved by engineers" title="What developers say" />
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {[
            { q: "Onboarding into a new repo went from days to an afternoon.", a: "Maya R.", r: "Staff Engineer, Fintech" },
            { q: "The architecture graph is what every README wishes it was.", a: "Jonas K.", r: "Tech Lead, SaaS" },
            { q: "Chat-with-code finds things grep never could.", a: "Priya S.", r: "Backend Engineer" },
          ].map((t) => (
            <figure key={t.a} className="glass rounded-2xl p-6">
              <blockquote className="text-foreground">"{t.q}"</blockquote>
              <figcaption className="mt-4 text-sm text-muted-foreground">{t.a} · {t.r}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="glass-strong rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 -z-10" style={{ backgroundImage: "var(--gradient-hero)" }} />
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Ready to unwire your codebase?</h2>
          <p className="mt-3 text-muted-foreground">Free to start. No credit card required.</p>
          <Link to="/signup" className="mt-6 inline-flex btn-primary-grad px-6 py-3 rounded-md font-medium">Get started free</Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs uppercase tracking-widest text-accent font-mono">{eyebrow}</div>
      <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}
