/**
 * auditService.ts
 *
 * Enterprise audit logging. Records every important action.
 * Non-blocking — never throws, never blocks the request.
 */

import { prisma } from "../database/db";

export interface AuditEntry {
  organizationId?: string;
  userId: string;
  action: string;
  resource?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * recordAudit — fire-and-forget audit entry.
 */
export function recordAudit(entry: AuditEntry): void {
  prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource ?? "",
      description: entry.description ?? "",
      metadata: (entry.metadata ?? {}) as any,
      ipAddress: entry.ipAddress ?? "",
    },
  }).catch((err) => {
    console.warn("[audit] Failed to record:", err.message);
  });
}

/**
 * listAuditLogs — paginated audit log retrieval.
 */
export async function listAuditLogs(opts: {
  organizationId?: string;
  userId?: string;
  action?: string;
  limit?: number;
  cursor?: string;
}) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const where: any = {};
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.userId) where.userId = opts.userId;
  if (opts.action) where.action = { startsWith: opts.action };
  if (opts.cursor) where.createdAt = { lt: new Date(opts.cursor) };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;
  return { logs: data, nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null };
}
