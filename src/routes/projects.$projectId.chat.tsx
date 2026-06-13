import { createFileRoute, useParams } from "@tanstack/react-router";
import { getProject } from "@/lib/mock-data";
import { useState, useRef, useEffect } from "react";
import { Send, FileCode2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/chat")({
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const SUGGESTIONS = [
  "How does authentication work?",
  "Where is payment implemented?",
  "Explain the /ai/categorize API",
  "Which files handle user login?",
];

function ChatPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/chat" });
  const p = getProject(projectId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, pending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setPending(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: mockAnswer(q, p.name),
          sources: ["src/routes/auth.js", "src/components/Login.jsx", "src/services/jwt.js"].slice(0, 2 + (q.length % 2)),
        },
      ]);
      setPending(false);
      inputRef.current?.focus();
    }, 900);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Ask your project anything</h2>
        <p className="text-muted-foreground text-sm">Grounded in {p.files} files indexed from {p.name}.</p>
      </header>

      <div ref={scrollRef} className="flex-1 glass rounded-2xl p-6 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-2xl btn-primary-grad flex items-center justify-center">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="mt-4 font-medium">Start a conversation</div>
            <div className="text-sm text-muted-foreground">Try one of these:</div>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 max-w-xl w-full">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="glass rounded-lg px-3 py-2.5 text-sm text-left hover:bg-secondary/50 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl mx-auto">
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {pending && (
              <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-4 glass rounded-2xl p-2 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about routes, files, architecture, business logic…"
          className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground max-h-40"
        />
        <button type="submit" disabled={!input.trim() || pending} className="btn-primary-grad rounded-lg h-10 w-10 flex items-center justify-center disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-primary text-primary-foreground">{msg.content}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-lg btn-primary-grad flex items-center justify-center shrink-0">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-7 whitespace-pre-wrap">{msg.content}</div>
        {msg.sources && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5">Sources</div>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md bg-secondary/60 border border-border">
                  <FileCode2 className="h-3 w-3 text-accent" /> {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function mockAnswer(q: string, project: string) {
  const lq = q.toLowerCase();
  if (lq.includes("auth") || lq.includes("login")) {
    return `In ${project}, authentication uses JWT issued by \`routes/auth.js\`. The \`POST /login\` endpoint validates credentials against the \`users\` collection, signs a token with \`services/jwt.js\`, and the \`requireAuth\` middleware verifies it on protected routes.`;
  }
  if (lq.includes("payment") || lq.includes("billing") || lq.includes("stripe")) {
    return `Payments are handled via Stripe Checkout. The frontend calls \`POST /billing/checkout\` which creates a Checkout Session in \`routes/billing.js\`. Stripe then posts events to \`POST /webhooks/stripe\` where subscription state is reconciled.`;
  }
  if (lq.includes("api")) {
    return `This route exists in \`services/ai.js\` and accepts \`{ text, userId }\`. It calls OpenAI with a categorization prompt and persists the result in the \`expenses\` collection.`;
  }
  return `Here is a high-level answer based on the indexed files of ${project}. Ask a more specific question — e.g. about a file, route, or feature — to drill in further.`;
}
