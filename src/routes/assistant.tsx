import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { fetchProjects, fetchServers, sendChatMessage } from "@/services/api";
import type { Project, Server } from "@/types/project";
import {
  Send, Sparkles, Loader2, FileCode2, MessagesSquare,
  Server as ServerIcon, FolderOpen, Zap,
} from "lucide-react";

export const Route = createFileRoute("/assistant")({
  head: () => ({ meta: [{ title: "AI Assistant · Unwire AI" }] }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const SUGGESTIONS = [
  "Why is my server slow?",
  "Which application uses most memory?",
  "Can I deploy this project safely?",
  "What should I improve before production?",
  "Explain my infrastructure architecture",
  "Are there any security risks?",
];

function AssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [context, setContext] = useState({ projects: 0, servers: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchServers()]).then(([p, s]) => {
      setContext({ projects: p.length, servers: s.length });
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setPending(true);
    try {
      // Use first project's chat endpoint if available, otherwise generic
      const res = await sendChatMessage("general", q);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't process that right now. Make sure the backend is running and a project is analyzed." }]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  const rightPanel = (
    <div className="p-4 space-y-4">
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-3">Context</div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><ServerIcon className="h-3.5 w-3.5" />{context.servers} servers</div>
          <div className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5" />{context.projects} projects</div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-3">
          AI assistant has access to your infrastructure data, metrics, logs, and code analysis.
        </p>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Capabilities</div>
        <div className="space-y-1.5">
          {["Code analysis", "Deployment advice", "Server diagnostics", "Performance tips", "Security review"].map((c) => (
            <div key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 text-primary/60" />{c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <DashboardLayout rightPanel={rightPanel}>
        <div className="h-full flex flex-col max-w-[900px] mx-auto px-6 py-6">
          {/* Header */}
          <div className="mb-4 shrink-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-primary" />AI DevOps Assistant
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Analyzing {context.servers} server{context.servers !== 1 ? "s" : ""} and {context.projects} project{context.projects !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Chat area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto glass rounded-2xl p-5 mb-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="h-14 w-14 rounded-2xl btn-primary-grad flex items-center justify-center">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <div className="font-semibold">Ask your AI DevOps engineer</div>
                  <div className="text-xs text-muted-foreground mt-1 max-w-sm">
                    I can analyze your infrastructure, explain failures, and recommend improvements.
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="glass rounded-lg px-3 py-2.5 text-xs text-left hover:bg-secondary/50 transition border border-border/50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "gap-2.5"}`}>
                    {m.role === "assistant" && (
                      <div className="h-7 w-7 rounded-lg btn-primary-grad flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-secondary/30 border border-border/50 rounded-tl-sm"
                    }`}>
                      {m.content}
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1.5">
                          {m.sources.map((s) => (
                            <span key={s} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border">
                              <FileCode2 className="h-2.5 w-2.5" />{s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {pending && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs pl-10">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="shrink-0 glass rounded-xl p-2 flex items-end gap-2">
            <textarea ref={inputRef} rows={1} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about your infrastructure, deployments, or code…"
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground overflow-hidden"
              style={{ minHeight: "40px", maxHeight: "120px" }} />
            <button type="submit" disabled={!input.trim() || pending}
              className="btn-primary-grad rounded-lg h-9 w-9 flex items-center justify-center shrink-0 disabled:opacity-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
