/**
 * dashboardController.ts
 *
 * Optimized dashboard summary endpoint.
 * Single API call returns all dashboard data instead of multiple calls.
 * Results are cached in Redis (60s TTL).
 */

import type { Request, Response } from "express";
import { prisma } from "../database/db";
import { cacheGet, cacheSet, CacheKeys, CacheTTL } from "../services/cacheService";

// ─── GET /api/dashboard/summary ───────────────────────────────────────────

export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    // Try cache first
    const cacheKey = CacheKeys.dashboardSummary(userId);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) { res.json({ success: true, data: cached }); return; }

    // Parallel optimized queries
    const [
      serverCount,
      onlineServers,
      projectCount,
      activeAlerts,
      recentDeployments,
      criticalAlerts,
    ] = await Promise.all([
      prisma.server.count({ where: { userId } }),
      prisma.server.count({ where: { userId, status: "online" } }),
      prisma.project.count({ where: { userId, NOT: { id: { startsWith: "agent-" } } } }),
      prisma.alert.count({ where: { userId, status: "ACTIVE" } }),
      prisma.deployment.findMany({
        where: { userId },
        select: { id: true, status: true, version: true, createdAt: true, project: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.alert.count({ where: { userId, status: "ACTIVE", severity: "CRITICAL" } }),
    ]);

    const summary = {
      servers: { total: serverCount, online: onlineServers },
      projects: { total: projectCount },
      alerts: { active: activeAlerts, critical: criticalAlerts },
      deployments: recentDeployments.map((d) => ({
        id: d.id, status: d.status, version: d.version,
        project: d.project.name, createdAt: d.createdAt.toISOString(),
      })),
      healthScore: serverCount > 0 ? Math.round((onlineServers / serverCount) * 100) : 0,
    };

    // Cache for 60s
    await cacheSet(cacheKey, summary, CacheTTL.dashboard);
    res.json({ success: true, data: summary });
  } catch { res.status(500).json({ success: false, error: "Failed to load dashboard." }); }
}
