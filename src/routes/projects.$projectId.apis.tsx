import { createFileRoute } from "@tanstack/react-router";
import { apis } from "@/lib/mock-data";

const METHOD_COLOR: Record<string, string> = {
  GET: "text-accent bg-accent/10 border-accent/30",
  POST: "text-primary bg-primary/10 border-primary/30",
  PATCH: "text-yellow-300 bg-yellow-500/10 border-yellow-500/30",
  DELETE: "text-destructive bg-destructive/10 border-destructive/30",
};

export const Route = createFileRoute("/projects/$projectId/apis")({
  component: () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">API Explorer</h2>
      <p className="text-muted-foreground text-sm">{apis.length} endpoints discovered across your codebase.</p>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Endpoint</th>
              <th className="text-left px-4 py-3">File</th>
              <th className="text-right px-4 py-3">Usage</th>
            </tr>
          </thead>
          <tbody>
            {apis.map((a) => (
              <tr key={a.name + a.method} className="border-t border-border hover:bg-secondary/20">
                <td className="px-4 py-3"><span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${METHOD_COLOR[a.method]}`}>{a.method}</span></td>
                <td className="px-4 py-3 font-mono">{a.name}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{a.file}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{a.usage} calls</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
});
