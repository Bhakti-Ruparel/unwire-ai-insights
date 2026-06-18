import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProjectServices } from "@/services/projectService";
import type { ExternalService } from "@/types/project";
import { Loader2, AlertCircle, Zap, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/services")({
  component: ServicesPage,
});

const SERVICE_TYPE_COLORS: Record<string, string> = {
  payment: "text-green-400 bg-green-500/10 border-green-500/30",
  ai: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  cloud: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  email: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  sms: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  auth: "text-red-400 bg-red-500/10 border-red-500/30",
  storage: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  database: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  monitoring: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  other: "text-muted-foreground bg-secondary/20 border-border",
};

function ServicesPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/services" });

  const [services, setServices] = useState<ExternalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProjectServices(projectId)
      .then(setServices)
      .catch(() => setError("Unable to load external services."))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">External Services</h2>
      <p className="text-muted-foreground text-sm">
        Third-party APIs and services detected in your codebase.
      </p>

      {loading && (
        <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Scanning for services…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 glass rounded-xl p-5 border border-destructive/30 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && services.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No external services detected in this project.</p>
        </div>
      )}

      {!loading && !error && services.length > 0 && (
        <>
          <p className="text-muted-foreground text-sm">
            {services.length} external service{services.length !== 1 ? "s" : ""} detected.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((svc) => (
              <div key={svc.name} className="glass rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-10 w-10 rounded-lg bg-secondary/60 border border-border flex items-center justify-center shrink-0">
                    <Zap className="h-5 w-5 text-accent" />
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                      SERVICE_TYPE_COLORS[svc.type] ?? SERVICE_TYPE_COLORS.other
                    }`}
                  >
                    {svc.type}
                  </span>
                </div>
                <div>
                  <div className="font-semibold">{svc.name}</div>
                  {svc.file && (
                    <div className="mt-1 text-xs text-muted-foreground font-mono truncate">
                      {svc.file}
                    </div>
                  )}
                </div>
                {svc.usage > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Used {svc.usage} time{svc.usage !== 1 ? "s" : ""} across codebase
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
