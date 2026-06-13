import { useEffect, useState } from "react";
import { Upload, Github, X, Check, Loader2 } from "lucide-react";

const STEPS = [
  "Extracting files",
  "Detecting framework",
  "Finding APIs",
  "Creating architecture map",
  "Building AI knowledge base",
];

export function NewProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [tab, setTab] = useState<"zip" | "github">("zip");
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!processing) return;
    if (step >= STEPS.length) {
      const t = setTimeout(() => { onCreated(); reset(); }, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(t);
  }, [processing, step, onCreated]);

  function reset() {
    setProcessing(false); setStep(0); setTab("zip");
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in">
      <div className="glass-strong rounded-2xl w-full max-w-lg p-6 relative">
        <button onClick={() => { onClose(); reset(); }} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <h2 className="text-xl font-semibold">Connect your project</h2>
        <p className="text-sm text-muted-foreground mt-1">Upload a ZIP or link a GitHub repository to begin analysis.</p>

        {!processing ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 p-1 rounded-lg bg-secondary/40 border border-border">
              <TabBtn active={tab === "zip"} onClick={() => setTab("zip")} icon={Upload} label="Upload ZIP" />
              <TabBtn active={tab === "github"} onClick={() => setTab("github")} icon={Github} label="Connect GitHub" />
            </div>

            {tab === "zip" ? (
              <label className="mt-5 block border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/60 transition">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <div className="mt-3 font-medium">Drop your project ZIP here</div>
                <div className="text-xs text-muted-foreground mt-1">or click to browse · max 200MB</div>
                <input type="file" accept=".zip" className="hidden" />
              </label>
            ) : (
              <div className="mt-5 space-y-3">
                <input
                  placeholder="https://github.com/your-org/your-repo"
                  className="w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted-foreground">We support public repos out of the box. Connect GitHub in Settings for private repos.</p>
              </div>
            )}

            <button
              onClick={() => setProcessing(true)}
              className="mt-6 w-full btn-primary-grad rounded-md py-2.5 font-medium"
            >
              Analyze Project
            </button>
          </>
        ) : (
          <div className="mt-6 space-y-3">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={label} className={`flex items-center gap-3 rounded-md px-3 py-2 border ${active ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  {done ? <Check className="h-4 w-4 text-accent" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <div className="h-4 w-4 rounded-full border border-border" />}
                  <span className={`text-sm ${done || active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 text-sm py-2 rounded-md transition ${active ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
