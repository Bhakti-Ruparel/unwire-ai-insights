/**
 * ChatPanel.tsx
 *
 * Resizable slide-in chat panel that appears on the right side of the
 * project dashboard. The user drags the left edge to resize it.
 * Toggle with the "AI Chat" button in the sidebar.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, FileCode2, Sparkles, Loader2, GripVertical, MessagesSquare } from "lucide-react";
import type { Project } from "@/types/project";
import { sendChatMessage } from "@/services/projectService";

// ─── Types ────────────────────────────────────────────────────────────────

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

const SUGGESTIONS = [
  "How does authentication work?",
  "Explain the API endpoints",
  "Which files handle user data?",
  "What database is used?",
];

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;

// ─── Props ────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ChatPanel({ open, onClose, project }: ChatPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Drag-to-resize ───────────────────────────────────────────────────────

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  // ── Send message ─────────────────────────────────────────────────────────

  async function send(text: string) {
    const q = text.trim();
    if (!q || pending || !project) return;

    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setPending(true);

    try {
      const result = await sendChatMessage(project.id, q, sessionIdRef.current);
      // Persist session id for conversation continuity
      sessionIdRef.current = result.sessionId;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, I couldn't process that. Make sure the backend is running.",
          sources: [],
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <>
      {/* Backdrop (subtle) */}
      <div
        className="fixed inset-0 z-30 bg-background/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-40 h-screen flex flex-col bg-[oklch(0.12_0.01_265)] border-l border-border shadow-2xl"
        style={{ width }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 h-full w-1 cursor-col-resize group hover:bg-primary/40 transition-colors z-10 flex items-center"
          title="Drag to resize"
        >
          <div className="absolute left-0 -translate-x-1/2 top-1/2 -translate-y-1/2 h-8 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg btn-primary-grad flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI Chat</div>
              {project && (
                <div className="text-[10px] text-muted-foreground font-mono leading-none mt-0.5">
                  {project.filesCount} files · {project.name}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState project={project} onSuggest={send} />
          ) : (
            <>
              {messages.map((m, i) => (
                <MessageBubble key={i} msg={m} />
              ))}
              {pending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
                  <span className="ml-1 text-xs">Thinking…</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="shrink-0 px-3 pb-3 pt-2 border-t border-border"
        >
          <div className="glass rounded-xl p-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow textarea
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Ask about routes, auth, architecture…"
              className="flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground overflow-hidden"
              style={{ minHeight: "36px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              className="btn-primary-grad rounded-lg h-9 w-9 flex items-center justify-center shrink-0 disabled:opacity-40 transition"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function EmptyState({
  project,
  onSuggest,
}: {
  project: Project | null;
  onSuggest: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
      <div className="h-14 w-14 rounded-2xl btn-primary-grad flex items-center justify-center">
        <MessagesSquare className="h-7 w-7" />
      </div>
      <div>
        <div className="font-medium">Ask about your codebase</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[240px]">
          Grounded in {project?.filesCount ?? 0} files from {project?.name ?? "your project"}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full mt-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="glass rounded-lg px-3 py-2.5 text-sm text-left hover:bg-secondary/50 transition border border-border/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-primary text-primary-foreground leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="h-7 w-7 rounded-lg btn-primary-grad flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-7 whitespace-pre-wrap">{msg.content}</div>
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md bg-secondary/60 border border-border"
                >
                  <FileCode2 className="h-3 w-3 text-accent" />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// (mock responses removed — real API used via sendChatMessage)
