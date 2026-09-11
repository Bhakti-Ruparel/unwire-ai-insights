import type { Request, Response } from "express";
import * as svc from "../servers/serverService";
import { getServerHealth as calculateServerHealth } from "../servers/healthService";
import { askServerAI } from "../servers/serverAI";
import { prisma } from "../database/db";
import {
  broadcastMetricIfSubscribers,
  broadcastHeartbeat,
  broadcastLog,
  broadcastStatusChange,
} from "../servers/serverSSE";

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
    // Associate with user's organization if available
    const orgId = (req as any).org?.id ?? undefined;
    const data = await svc.createServer({ name, host, provider, region, sshUser, sshPort, userId, organizationId: orgId });
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
    const serverId = req.params.id;

    // Return full server health data matching frontend expectations:
    // { server: Server, apps: ServerApp[], latestMetric: MetricSnapshot | null }
    const [serverData, apps, latestMetric] = await Promise.all([
      svc.getServerById(serverId),
      svc.getServerApps(serverId),
      prisma.serverMetric.findFirst({
        where: { serverId },
        orderBy: { recordedAt: "desc" },
      }),
    ]);

    if (!serverData) {
      res.status(404).json({ success: false, error: "Server not found." });
      return;
    }

    res.json({
      success: true,
      data: {
        server: serverData,
        apps,
        latestMetric: latestMetric ? {
          cpuPercent: latestMetric.cpuPercent,
          ramPercent: latestMetric.ramPercent,
          diskPercent: latestMetric.diskPercent,
          networkIn: latestMetric.networkIn,
          networkOut: latestMetric.networkOut,
          cpuCores: latestMetric.cpuCores,
          loadAverage: latestMetric.loadAverage,
          memoryTotal: latestMetric.memoryTotal,
          memoryUsed: latestMetric.memoryUsed,
          memoryFree: latestMetric.memoryFree,
          diskTotal: latestMetric.diskTotal,
          diskUsed: latestMetric.diskUsed,
          recordedAt: latestMetric.recordedAt.toISOString(),
        } : null,
      },
    });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get health." }); }
}

// ─── GET /api/servers/:id/agent-health ────────────────────────────────────
export async function getAgentHealth(req: Request, res: Response): Promise<void> {
  try {
    const { getAgentHealth: checkHealth } = await import("../deployment/agentClient");
    const health = await checkHealth(req.params.id);

    // Also get last heartbeat from DB
    const lastHb = await prisma.serverHeartbeat.findFirst({
      where: { serverId: req.params.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, agentVersion: true, ip: true },
    });

    res.json({
      success: true,
      data: {
        connected: health.connected,
        latencyMs: health.latencyMs,
        endpoint: health.endpoint,
        agentVersion: health.agentVersion ?? lastHb?.agentVersion ?? null,
        lastHeartbeat: lastHb?.timestamp?.toISOString() ?? null,
        lastIp: lastHb?.ip ?? null,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: "Failed to check agent health." });
  }
}

// ─── GET /api/servers/:id/metrics ─────────────────────────────────────────
export async function getServerMetrics(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || undefined;
    const limit = parseInt(req.query.limit as string) || undefined;
    const range = (req.query.range as any) || undefined;

    // If pagination requested, use paginated method
    if (page !== undefined) {
      const data = await svc.getMetricsWithPagination(req.params.id, { page, limit, range });
      res.json({ success: true, data });
    } else {
      // Legacy: simple list with limit
      const cappedLimit = Math.min(Math.max(limit ?? 60, 1), 500);
      const data = await svc.getMetricHistory(req.params.id, cappedLimit, range);
      res.json({ success: true, data });
    }
  } catch (err) { res.status(500).json({ success: false, error: "Failed to get metrics." }); }
}

// ─── POST /api/servers/:id/metrics ────────────────────────────────────────
// Called by a server agent or monitoring tool to push metrics
export async function pushMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { cpuPercent, ramPercent, diskPercent, networkIn, networkOut } = req.body;
    await svc.saveMetric(req.params.id, { cpuPercent, ramPercent, diskPercent, networkIn, networkOut });
    await svc.updateServerStatus(req.params.id, "online");
    
    // Broadcast to SSE subscribers
    await broadcastMetricIfSubscribers(req.params.id);
    broadcastStatusChange(req.params.id, "online");
    
    res.json({ success: true, data: { message: "Metrics saved." } });
  } catch (err) { res.status(500).json({ success: false, error: "Failed to save metrics." }); }
}

// POST /api/servers/:id/heartbeat
export async function pushHeartbeat(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;

    // Record heartbeat in database (this is what computeLiveStatus reads)
    await svc.recordHeartbeat(serverId, {
      status: "online",
      agentVersion: req.body.agentVersion ?? "",
    }, req.ip ?? "");

    // Also update the static status field for backward compat
    await svc.updateServerStatus(serverId, "online");
    
    // Broadcast to SSE subscribers
    broadcastHeartbeat(serverId, "online");
    
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
    const page = parseInt(req.query.page as string) || undefined;
    const appName = req.query.appName as string | undefined;
    const level = req.query.level as string | undefined;
    const limit = parseInt(req.query.limit as string) || undefined;
    const range = (req.query.range as any) || undefined;

    // If pagination requested, use paginated method
    if (page !== undefined) {
      const data = await svc.getServerLogsWithPagination(req.params.id, { page, appName, level, limit, range });
      res.json({ success: true, data });
    } else {
      // Legacy: simple list with limit
      const cappedLimit = Math.min(Math.max(limit ?? 100, 1), 500);
      const data = await svc.getServerLogs(req.params.id, {
        appName,
        level,
        limit: cappedLimit,
      });
      res.json({ success: true, data });
    }
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
    
    // Broadcast to SSE subscribers
    for (const log of logs) {
      broadcastLog(req.params.id, {
        appName: log.appName || "",
        level: log.level || "info",
        message: log.message,
        timestamp: log.timestamp || new Date().toISOString(),
      });
    }
    
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
