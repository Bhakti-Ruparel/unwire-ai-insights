/**
 * alertController.ts
 *
 * HTTP controller for the alerts and notifications system.
 */

import type { Request, Response } from "express";
import * as alertSvc from "../monitoring/alertService";
import { prisma } from "../database/db";

// ─── GET /api/alerts ──────────────────────────────────────────────────────
export async function listAlerts(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const { status, severity, serverId, limit, cursor } = req.query;
    const data = await alertSvc.listAlerts(userId, {
      status: status as any,
      severity: severity as any,
      serverId: serverId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      cursor: cursor as string,
    });
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch alerts." }); }
}

// ─── GET /api/alerts/summary ──────────────────────────────────────────────
export async function alertSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    const data = await alertSvc.getAlertSummary(userId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch alert summary." }); }
}

// ─── PATCH /api/alerts/:id/acknowledge ────────────────────────────────────
export async function acknowledge(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    await alertSvc.acknowledgeAlert(req.params.id, userId);
    res.json({ success: true, data: { message: "Alert acknowledged." } });
  } catch { res.status(500).json({ success: false, error: "Failed to acknowledge alert." }); }
}

// ─── PATCH /api/alerts/:id/resolve ────────────────────────────────────────
export async function resolve(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    await alertSvc.resolveAlert(req.params.id, userId);
    res.json({ success: true, data: { message: "Alert resolved." } });
  } catch { res.status(500).json({ success: false, error: "Failed to resolve alert." }); }
}

// ─── GET /api/notifications ───────────────────────────────────────────────
export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const unread = await prisma.notification.count({ where: { userId, read: false } });
    res.json({ success: true, data: { notifications, unread } });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch notifications." }); }
}

// ─── PATCH /api/notifications/read-all ────────────────────────────────────
export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    res.json({ success: true, data: { message: "All notifications marked as read." } });
  } catch { res.status(500).json({ success: false, error: "Failed to mark notifications." }); }
}
