/**
 * infraController.ts
 *
 * HTTP controller for multi-cloud infrastructure management.
 */

import type { Request, Response } from "express";
import * as infraSvc from "../infrastructure/infraService";
import { prisma } from "../database/db";

// ─── GET /api/infrastructure/providers ────────────────────────────────────
export async function listProviders(_req: Request, res: Response): Promise<void> {
  try {
    const providers = infraSvc.listProviders();
    res.json({ success: true, data: providers });
  } catch { res.status(500).json({ success: false, error: "Failed to list providers." }); }
}

// ─── POST /api/infrastructure/connect ─────────────────────────────────────
export async function connect(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "Organization required." }); return; }

    const { provider, name, credentials } = req.body;
    if (!provider || !name || !credentials) {
      res.status(400).json({ success: false, error: "provider, name, and credentials are required." }); return;
    }

    const result = await infraSvc.connectProvider({
      organizationId: orgId, userId, provider, name, credentials,
    });

    if ("error" in result) { res.status(400).json({ success: false, error: result.error }); return; }
    res.status(201).json({ success: true, data: result });
  } catch { res.status(500).json({ success: false, error: "Failed to connect provider." }); }
}

// ─── POST /api/infrastructure/disconnect ──────────────────────────────────
export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "Organization required." }); return; }

    const { connectionId } = req.body;
    if (!connectionId) { res.status(400).json({ success: false, error: "connectionId required." }); return; }

    await infraSvc.disconnectProvider(connectionId, orgId, userId);
    res.json({ success: true, data: { message: "Disconnected." } });
  } catch { res.status(500).json({ success: false, error: "Failed to disconnect." }); }
}

// ─── GET /api/infrastructure/connections ──────────────────────────────────
export async function listConnections(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.json({ success: true, data: [] }); return; }

    const data = await infraSvc.listConnections(orgId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to list connections." }); }
}

// ─── GET /api/infrastructure/resources ────────────────────────────────────
export async function listResources(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.json({ success: true, data: { resources: [], nextCursor: null } }); return; }

    const { provider, resourceType, status, connectionId, limit, cursor } = req.query;
    const data = await infraSvc.listResources(orgId, {
      provider: provider as string,
      resourceType: resourceType as string,
      status: status as string,
      connectionId: connectionId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      cursor: cursor as string,
    });
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to list resources." }); }
}

// ─── POST /api/infrastructure/sync/:id ────────────────────────────────────
export async function syncConnection(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "Organization required." }); return; }

    // Verify ownership
    const conn = await prisma.infraConnection.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!conn) { res.status(404).json({ success: false, error: "Connection not found." }); return; }

    const result = await infraSvc.syncConnection(req.params.id);
    if ("error" in result) { res.status(400).json({ success: false, error: result.error }); return; }
    res.json({ success: true, data: result });
  } catch { res.status(500).json({ success: false, error: "Sync failed." }); }
}

// ─── GET /api/infrastructure/summary ──────────────────────────────────────
export async function getSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.json({ success: true, data: { connections: 0, providers: {} } }); return; }

    const data = await infraSvc.getInfraSummary(orgId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to get summary." }); }
}

// ─── Helper ───────────────────────────────────────────────────────────────
async function getOrgId(userId: string): Promise<string | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId }, select: { organizationId: true }, orderBy: { joinedAt: "asc" },
  });
  return m?.organizationId ?? null;
}
