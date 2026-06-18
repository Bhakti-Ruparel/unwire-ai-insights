import type { Request, Response } from "express";
import * as svc from "../deployment/deploymentExecutionService";
import { getQueueHealth } from "../queue/deploymentQueue";

// ─── POST /api/deployments ─────────────────────────────────────────────────
export async function createDeployment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const { projectId, serverId, branch, environment } = req.body;
    if (!projectId || !serverId) {
      res.status(400).json({ success: false, error: "projectId and serverId are required." }); return;
    }

    const dep = await svc.createDeployment({ projectId, serverId, userId, branch, environment });
    res.status(201).json({ success: true, data: dep });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create deployment.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── GET /api/deployments?projectId= ──────────────────────────────────────
export async function listDeployments(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const { projectId, cursor, limit } = req.query;
    if (!projectId) { res.status(400).json({ success: false, error: "projectId is required." }); return; }

    const data = await svc.listDeployments({
      projectId: projectId as string,
      userId,
      cursor:    cursor as string | undefined,
      limit:     limit ? parseInt(limit as string) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch deployments." });
  }
}

// ─── GET /api/deployments/:id ─────────────────────────────────────────────
export async function getDeployment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const dep = await svc.getDeployment(req.params.id, userId);
    if (!dep) { res.status(404).json({ success: false, error: "Deployment not found." }); return; }
    res.json({ success: true, data: dep });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch deployment." });
  }
}

// ─── GET /api/deployments/:id/logs ────────────────────────────────────────
export async function getDeploymentLogs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const { cursor, limit } = req.query;
    const data = await svc.getDeploymentLogs({
      deploymentId: req.params.id,
      userId,
      cursor:  cursor as string | undefined,
      limit:   limit  ? parseInt(limit as string) : undefined,
    });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch logs." });
  }
}

// ─── GET /api/projects/:id/deployment-plan ────────────────────────────────
export async function getDeploymentPlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const plan = await svc.previewDeploymentPlan(req.params.id, userId);
    res.json({ success: true, data: plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate plan.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── POST /api/deployments/:id/rollback ───────────────────────────────────
export async function rollbackDeployment(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const dep = await svc.rollback(req.params.id, userId);
    res.json({ success: true, data: dep });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rollback failed.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── GET /api/deployments/health (queue health) ───────────────────────────
export async function queueHealth(req: Request, res: Response): Promise<void> {
  try {
    const health = await getQueueHealth().catch(() => ({ waiting: 0, active: 0, failed: 0, completed: 0 }));
    const stats  = await svc.getDeploymentStats();
    res.json({ success: true, data: { queue: health, stats } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to get queue health." });
  }
}

// ─── GET /api/deployments/:id/logs/stream (SSE) ───────────────────────────
export async function streamDeploymentLogs(req: Request, res: Response): Promise<void> {
  // Support token in query param for EventSource (which can't set headers)
  const token = req.headers.authorization?.slice(7) ?? (req.query.token as string);
  let userId: string | undefined = req.user?.userId;

  if (!userId && token) {
    try {
      const { verifyToken } = await import("../services/authService");
      userId = verifyToken(token).userId;
    } catch { /* invalid token */ }
  }

  if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

  // Verify ownership
  const dep = await svc.getDeployment(req.params.id, userId!);
  if (!dep) { res.status(404).json({ success: false, error: "Deployment not found." }); return; }

  // Set SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");  // disable nginx buffering
  res.flushHeaders();

  const deploymentId = req.params.id;
  let lastCursor: string | undefined;
  let finished = false;

  // Send heartbeat immediately
  res.write(": heartbeat\n\n");

  async function poll() {
    if (finished) return;

    try {
      const { logs, nextCursor } = await svc.getDeploymentLogs({
        deploymentId,
        userId:  userId!,
        cursor:  lastCursor,
        limit:   50,
      });

      if (logs.length > 0) {
        for (const log of logs) {
          res.write(`data: ${JSON.stringify(log)}\n\n`);
        }
        lastCursor = logs[logs.length - 1].id;
      }

      // Check if deployment is terminal
      const current = await svc.getDeployment(deploymentId, userId!);
      const terminal = ["SUCCESS", "FAILED", "ROLLED_BACK"].includes(current?.status ?? "");

      if (terminal && logs.length === 0) {
        // All logs sent, deployment done
        res.write(`event: done\ndata: ${JSON.stringify({ status: current?.status })}\n\n`);
        finished = true;
        res.end();
        return;
      }
    } catch (err) {
      console.error("[SSE]", err);
    }

    // Poll every 1.5 seconds while deployment is active
    if (!finished) setTimeout(poll, 1500);
  }

  // Start polling
  poll();

  // Clean up on client disconnect
  req.on("close", () => { finished = true; });
}
