import type { Request, Response } from "express";
import * as svc from "../servers/serverService";
import { askServerAI } from "../servers/serverAI";

// ─── GET /api/servers ──────────────────────────────────────────────────────
export async function listServers(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const data = await svc.getAllServers(userId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to list servers." }); }
}

// ─── GET /api/servers/:id ─────────────────────────────────────────────────
export async function getServer(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const data = await svc.getServerById(req.params.id, userId);
    if (!data) { res.status(404).json({ success: false, error: "Server not found." }); return; }
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get server." }); }
}

// ─── POST /api/servers ────────────────────────────────────────────────────
export async function createServer(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { name, host, provider, region, sshUser, sshPort } = req.body;
    if (!name || !host) {
      res.status(400).json({ success: false, error: "name and host are required." });
      return;
    }
    const data = await svc.createServer({ name, host, provider, region, sshUser, sshPort, userId });
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to create server." }); }
}

// ─── DELETE /api/servers/:id ──────────────────────────────────────────────
export async function deleteServer(req: Request, res: Response): Promise<void> {
  try {
    await svc.deleteServer(req.params.id);
    res.json({ success: true, data: { message: "Server deleted." } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to delete server." }); }
}

// ─── GET /api/servers/:id/health ─────────────────────────────────────────
export async function getServerHealth(req: Request, res: Response): Promise<void> {
  try {
    const server = await svc.getServerById(req.params.id);
    if (!server) { res.status(404).json({ success: false, error: "Server not found." }); return; }
    const [apps, metrics] = await Promise.all([
      svc.getServerApps(req.params.id),
      svc.getMetricHistory(req.params.id, 1),
    ]);
    res.json({
      success: true,
      data: { server, apps, latestMetric: metrics[0] ?? null },
    });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get health." }); }
}

// ─── GET /api/servers/:id/metrics ─────────────────────────────────────────
export async function getServerMetrics(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 60;
    const data = await svc.getMetricHistory(req.params.id, limit);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get metrics." }); }
}

// ─── POST /api/servers/:id/metrics ────────────────────────────────────────
// Called by a server agent or monitoring tool to push metrics
export async function pushMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { cpuPercent, ramPercent, diskPercent, networkIn, networkOut } = req.body;
    await svc.saveMetric(req.params.id, { cpuPercent, ramPercent, diskPercent, networkIn, networkOut });
    await svc.updateServerStatus(req.params.id, "online");
    res.json({ success: true, data: { message: "Metrics saved." } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to save metrics." }); }
}

// POST /api/servers/:id/heartbeat
export async function pushHeartbeat(req: Request, res: Response): Promise<void> {
  try {
    await svc.updateServerStatus(req.params.id, "online");
    res.json({ success: true, data: { message: "Heartbeat received." } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save heartbeat." });
  }
}

// ─── GET /api/servers/:id/apps ─────────────────────────────────────────────
export async function getServerApps(req: Request, res: Response): Promise<void> {
  try {
    const data = await svc.getServerApps(req.params.id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get apps." }); }
}

// ─── POST /api/servers/:id/apps/:appName/action ───────────────────────────
export async function appAction(req: Request, res: Response): Promise<void> {
  try {
    const { appName } = req.params;
    const { action } = req.body as { action: "start" | "stop" | "restart" };
    if (!["start", "stop", "restart"].includes(action)) {
      res.status(400).json({ success: false, error: "action must be start|stop|restart." });
      return;
    }
    const statusMap: Record<string, string> = { start: "running", stop: "stopped", restart: "restarting" };
    await svc.updateAppStatus(req.params.id, appName, statusMap[action], action);
    // Log the action
    await svc.appendLogs(req.params.id, [{
      appName,
      level: "info",
      message: `Application ${action} action triggered via Unwire AI dashboard`,
    }]);
    res.json({ success: true, data: { message: `${appName} ${action} triggered.` } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to execute action." }); }
}

// ─── GET /api/servers/:id/logs ─────────────────────────────────────────────
export async function getServerLogs(req: Request, res: Response): Promise<void> {
  try {
    const { appName, level, limit } = req.query;
    const data = await svc.getServerLogs(req.params.id, {
      appName: appName as string | undefined,
      level:   level   as string | undefined,
      limit:   limit   ? parseInt(limit as string) : 100,
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get logs." }); }
}

// ─── POST /api/servers/:id/logs ───────────────────────────────────────────
// Server agent pushes logs here
export async function pushLogs(req: Request, res: Response): Promise<void> {
  try {
    const { logs } = req.body as {
      logs: Array<{ appName: string; level: string; message: string; timestamp?: string }>;
    };
    if (!Array.isArray(logs)) {
      res.status(400).json({ success: false, error: "logs must be an array." });
      return;
    }
    await svc.appendLogs(req.params.id, logs.map((l) => ({
      ...l,
      timestamp: l.timestamp ? new Date(l.timestamp) : new Date(),
    })));
    res.json({ success: true, data: { saved: logs.length } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to push logs." }); }
}

// ─── GET /api/servers/:id/domains ─────────────────────────────────────────
export async function getDomains(req: Request, res: Response): Promise<void> {
  try {
    const data = await svc.getServerDomains(req.params.id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get domains." }); }
}

// ─── POST /api/servers/:id/domains ────────────────────────────────────────
export async function addDomain(req: Request, res: Response): Promise<void> {
  try {
    const { domain, type, target } = req.body;
    if (!domain || !target) {
      res.status(400).json({ success: false, error: "domain and target are required." });
      return;
    }
    const data = await svc.addDomain(req.params.id, { domain, type: type || "A", target });
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to add domain." }); }
}

// ─── DELETE /api/servers/:id/domains/:domainId ───────────────────────────
export async function deleteDomain(req: Request, res: Response): Promise<void> {
  try {
    await svc.deleteDomain(req.params.domainId);
    res.json({ success: true, data: { message: "Domain removed." } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to delete domain." }); }
}

// ─── GET /api/servers/:id/ssl ─────────────────────────────────────────────
export async function getSslCerts(req: Request, res: Response): Promise<void> {
  try {
    const data = await svc.getServerSslCerts(req.params.id);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get SSL certs." }); }
}

// ─── POST /api/servers/:id/ssl ────────────────────────────────────────────
export async function addSslCert(req: Request, res: Response): Promise<void> {
  try {
    const { domain, provider, expiresAt, autoRenew } = req.body;
    if (!domain) { res.status(400).json({ success: false, error: "domain is required." }); return; }
    const data = await svc.addSslCert(req.params.id, {
      domain, provider,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      autoRenew,
    });
    res.status(201).json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to add SSL cert." }); }
}

// ─── POST /api/servers/:id/ask ────────────────────────────────────────────
export async function askServer(req: Request, res: Response): Promise<void> {
  try {
    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      res.status(400).json({ success: false, error: "message is required." });
      return;
    }
    const result = await askServerAI(req.params.id, message);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("[askServer]", err);
    res.status(500).json({ success: false, error: "Failed to get AI answer." });
  }
}

// POST /api/servers/:id/regenerate-token
export async function regenerateAgentToken(req: Request, res: Response): Promise<void> {
  try {
    const data = await svc.regenerateAgentToken(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to regenerate agent token." });
  }
}
