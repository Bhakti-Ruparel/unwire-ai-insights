/**
 * alertService.ts
 *
 * CRUD operations for alerts + intelligent alert creation.
 * Prevents alert spam via deduplication (same type+server within 15 min).
 */

import { prisma } from "../database/db";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
export type AlertType =
  | "cpu_high" | "ram_high" | "disk_high"
  | "app_crash" | "deploy_failed"
  | "server_offline" | "error_spike";

export interface CreateAlertDTO {
  userId: string;
  organizationId?: string;
  serverId?: string;
  projectId?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
}

const DEDUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * createAlert — creates an alert with deduplication.
 * Won't create a duplicate if the same type+server alert exists within 15 min.
 */
export async function createAlert(dto: CreateAlertDTO): Promise<string | null> {
  // Dedup check
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.alert.findFirst({
    where: {
      userId: dto.userId,
      type: dto.type,
      serverId: dto.serverId ?? undefined,
      status: "ACTIVE",
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });

  if (existing) return null; // Already alerted recently

  const alert = await prisma.alert.create({
    data: {
      userId: dto.userId,
      organizationId: dto.organizationId,
      serverId: dto.serverId,
      projectId: dto.projectId,
      type: dto.type,
      severity: dto.severity,
      title: dto.title,
      message: dto.message,
      recommendation: dto.recommendation ?? "",
      metadata: (dto.metadata ?? {}) as any,
    },
  });

  // Create in-app notification
  await prisma.notification.create({
    data: {
      userId: dto.userId,
      type: "alert",
      title: dto.title,
      message: dto.message,
      metadata: { alertId: alert.id, severity: dto.severity } as any,
    },
  }).catch(() => {}); // Non-blocking

  return alert.id;
}

/** Acknowledge an alert */
export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  await prisma.alert.updateMany({
    where: { id: alertId, userId },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });
}

/** Resolve an alert */
export async function resolveAlert(alertId: string, userId: string): Promise<void> {
  await prisma.alert.updateMany({
    where: { id: alertId, userId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

/** List alerts for a user with pagination */
export async function listAlerts(userId: string, opts: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  serverId?: string;
  limit?: number;
  cursor?: string;
} = {}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const where: any = { userId };
  if (opts.status) where.status = opts.status;
  if (opts.severity) where.severity = opts.severity;
  if (opts.serverId) where.serverId = opts.serverId;
  if (opts.cursor) where.createdAt = { lt: new Date(opts.cursor) };

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = alerts.length > limit;
  const data = hasMore ? alerts.slice(0, limit) : alerts;
  const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

  return { alerts: data, nextCursor };
}

/** Get alert summary counts */
export async function getAlertSummary(userId: string) {
  const [critical, warning, resolved] = await Promise.all([
    prisma.alert.count({ where: { userId, severity: "CRITICAL", status: "ACTIVE" } }),
    prisma.alert.count({ where: { userId, severity: "WARNING", status: "ACTIVE" } }),
    prisma.alert.count({ where: { userId, status: "RESOLVED" } }),
  ]);
  return { critical, warning, resolved, total: critical + warning };
}
