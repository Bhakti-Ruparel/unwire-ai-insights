import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/backend")({
  component: () => {
    const cards = [
      { label: "Framework", value: "Express" },
      { label: "Routes", value: "23" },
      { label: "Controllers", value: "8" },
      { label: "Middleware", value: "JWT Auth · CORS · Rate-limit" },
    ];
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="glass rounded-xl p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">{c.label}</div>
              <div className="mt-2 text-lg font-semibold">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-sm font-medium">Request flow</div>
          <pre className="mt-3 text-xs font-mono text-muted-foreground leading-6">{`Client → CORS → RateLimit → JWTAuth → Router → Controller → Service → Model → DB`}</pre>
        </div>
      </div>
    );
  },
});
