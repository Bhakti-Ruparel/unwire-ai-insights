/**
 * GlobalAIAgent.tsx
 *
 * Floating AI DevOps assistant available from every page.
 * Renders as a fixed button (bottom-right) + overlay chat panel.
 * Does NOT change the dashboard layout when opened.
 *
 * Features:
 *  - Natural language queries (no hardcoded questions)
 *  - Automatic intent classification (info vs action)
 *  - Tool execution indicators (friendly messages)
 *  - Chat memory within session
 *  - Sources + recommendations in responses
 */

import { useEffect, useRef, useState } from "react";
import {
  X, Send, Sparkles, Loader2, Bot, Minimize2,
  Search, Terminal, Activity, FileCode2, Zap,
} from "lucide-react";
import { sendAgentMessage } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

type Msg = {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: string[];
  tools?: string[];       // friendly tool names shown during execution
  intent?: "info" | "action";
};

// Friendly tool execution messages
const TOOL_MESSAGES: Record<string, string> = {
  metrics:    "Reading server metrics…",
  logs:       "Searching logs…",
  codebase:   "Analyzing codebase…",
  deployment: "Checking deployment history…",
  project:    "Loading project context…",
  planning:   "Creating action plan…",
  testing:    "Running verification…",
};

export function GlobalAIAgent() {
  const { isLoggedIn } = useAuth();
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput]     = useState("");
  const [pending, setPending] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolStatus]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  if (!isLoggedIn) return null;

  async function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;

    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setPending(true);

    // Show tool execution simulation based on keywords
    const lq = q.toLowerCase();
    if (lq.includes("server") || lq.includes("cpu") || lq.includes("memory") || lq.includes("slow")) {
      setToolStatus(TOOL_MESSAGES.metrics);
      await sleep(600);
      setToolStatus(TOOL_MESSAGES.logs);
      await sleep(500);
    } else if (lq.includes("deploy") || lq.includes("build")) {
      setToolStatus(TOOL_MESSAGES.deployment);
      await sleep(600);
    } else if (lq.includes("code") || lq.includes("file") || lq.includes("function")) {
      setToolStatus(TOOL_MESSAGES.codebase);
      await sleep(600);
    } else {
      setToolStatus(TOOL_MESSAGES.project);
      await sleep(400);
    }

    try {
      // Use the dedicated AI agent endpoint
      const res = await sendAgentMessage(q, sessionId);
      setSessionId(res.sessionId);
      setMessages((m) => [...m, {
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        tools: res.toolsUsed,
        intent: res.intent ?? classifyIntent(q),
      }]);
    } catch {
      setMessages((m) => [...m, {
        role: "assistant",
        content: "I couldn't process that request. Make sure you have at least one analyzed project or connected server for context.",
      }]);
    } finally {
      setPending(false);
      setToolStatus(null);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full btn-primary-grad shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform"
          title="Unwire AI Agent"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Overlay chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[600px] max-h-[80vh] glass-strong rounded-2xl border border-border shadow-2xl shadow-black/40 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg btn-primary-grad flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Unwire AI Engineer</div>
                <div className="text-[10px] text-green-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Analyzing your infrastructure
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition">
                <Minimize2 className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="font-medium text-sm">Hi! I'm your AI DevOps engineer.</div>
                <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                  Ask me anything about your servers, deployments, code, or infrastructure.
                  I'll analyze the issue and recommend solutions.
                </p>
                <div className="text-[10px] text-muted-foreground/50 mt-2">
                  Type naturally — I'll figure out what you need.
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}

            {/* Tool execution status */}
            {toolStatus && (
              <div className="flex items-center gap-2.5 text-xs text-primary pl-1 py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>{toolStatus}</span>
              </div>
            )}

            {pending && !toolStatus && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="shrink-0 px-3 pb-3 pt-2 border-t border-border/60">
            <div className="glass rounded-xl p-1.5 flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                }}
                placeholder="Ask anything about your infrastructure..."
                className="flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground overflow-hidden"
                style={{ minHeight: "36px", maxHeight: "100px" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || pending}
                className="btn-primary-grad rounded-lg h-8 w-8 flex items-center justify-center shrink-0 disabled:opacity-40 transition"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm bg-primary text-primary-foreground leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border">
                <FileCode2 className="h-2.5 w-2.5 text-accent" />{s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Intent classifier (client-side, fast) ────────────────────────────────

function classifyIntent(query: string): "info" | "action" {
  const lq = query.toLowerCase();
  const actionWords = ["fix", "deploy", "optimize", "restart", "update", "install", "create", "delete", "change", "modify", "solve", "patch"];
  return actionWords.some((w) => lq.includes(w)) ? "action" : "info";
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
