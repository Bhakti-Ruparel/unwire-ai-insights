import { useEffect, useState } from "react";
import { Upload, Github, X, Check, Loader2 } from "lucide-react";
import type { Project, CreateProjectPayload } from "@/types/project";
import { createProject, createProjectWithZip } from "@/services/projectService";

const ANALYSIS_STEPS = [
  "Extracting files",
  "Detecting framework",
  "Finding APIs",
  "Creating architecture map",
  "Building AI knowledge base",
];

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the newly created Project once analysis completes. */
  onCreated: (project: Project) => void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [tab, setTab] = useState<"zip" | "github">("zip");
  const [projectName, setProjectName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState("");

  // Step-by-step analysis animation (only visual — runs after real API call)
  useEffect(() => {
    if (!processing) return;
    if (step >= ANALYSIS_STEPS.length) {
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(t);
  }, [processing, step]);

  function reset() {
    setProcessing(false);
    setStep(0);
    setTab("zip");
    setProjectName("");
    setGithubUrl("");
    setSelectedFile(null);
    setError(null);
    setNameError("");
  }

  async function handleSubmit() {
    if (!projectName.trim()) {
      setNameError("Project name is required.");
      return;
    }
    if (tab === "zip" && !selectedFile) {
      setError("Please select a ZIP file to upload.");
      return;
    }
    setNameError("");
    setError(null);
    setProcessing(true);

    try {
      let project: Project;
      if (tab === "zip") {
        const payload: CreateProjectPayload & { file: File } = {
          name: projectName.trim(),
          sourceType: "zip",
          file: selectedFile!,
        };
        project = await createProjectWithZip(payload);
      } else {
        project = await createProject({
          name: projectName.trim(),
          sourceType: "github",
          githubUrl: githubUrl || undefined,
        });
      }

      setStep(ANALYSIS_STEPS.length);
      setTimeout(() => {
        onCreated(project);
        reset();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
      setProcessing(false);
      setStep(0);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in">
      <div className="glass-strong rounded-2xl w-full max-w-lg p-6 relative">
        <button
          onClick={() => { onClose(); reset(); }}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-semibold">Connect your project</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a ZIP or link a GitHub repository to begin analysis.
        </p>

        {!processing ? (
          <>
            {/* Source tab switcher */}
            <div className="mt-5 grid grid-cols-2 gap-2 p-1 rounded-lg bg-secondary/40 border border-border">
              <TabBtn active={tab === "zip"} onClick={() => setTab("zip")} icon={Upload} label="Upload ZIP" />
              <TabBtn active={tab === "github"} onClick={() => setTab("github")} icon={Github} label="Connect GitHub" />
            </div>

            {/* Project name */}
            <div className="mt-5 space-y-1">
              <label className="text-sm text-muted-foreground">Project name</label>
              <input
                value={projectName}
                onChange={(e) => { setProjectName(e.target.value); setNameError(""); }}
                placeholder="My Awesome App"
                className="w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>

            {/* Source input */}
            {tab === "zip" ? (
              <label className="mt-4 block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 transition">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                {selectedFile ? (
                  <div className="mt-3">
                    <div className="font-medium text-sm">{selectedFile.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 font-medium">Drop your project ZIP here</div>
                    <div className="text-xs text-muted-foreground mt-1">or click to browse · max 200MB</div>
                  </>
                )}
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="mt-4 space-y-3">
                <input
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/your-org/your-repo"
                  className="w-full bg-secondary/40 border border-border rounded-md px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
                />
                <p className="text-xs text-muted-foreground">
                  Public repos work out of the box. Connect GitHub in Settings for private repos.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              className="mt-6 w-full btn-primary-grad rounded-md py-2.5 font-medium"
            >
              Analyze Project
            </button>
          </>
        ) : (
          <div className="mt-6 space-y-3">
            {ANALYSIS_STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 border ${active ? "border-primary/40 bg-primary/5" : "border-border"}`}
                >
                  {done ? (
                    <Check className="h-4 w-4 text-accent" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border" />
                  )}
                  <span className={`text-sm ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 text-sm py-2 rounded-md transition ${active ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
