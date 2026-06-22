/**
 * healthService.ts
 *
 * Server health calculation engine.
 * Determines health status (healthy/warning/critical) based on metrics.
 */

import { prisma } from "../database/db";

export type HealthStatus = "healthy" | "warning" | "critical" | "offline";

export interface ServerHealth {
  serverId: string;
  status: HealthStatus;
  score: number; // 0–100, higher is better
  reasons: string[];
  lastHeartbeat?: Date;
  secondsWithoutHeartbeat?: number;
}

const HEALTH_THRESHOLDS = {
  cpuCritical: 90,
  cpuWarning: 75,
  ramCritical: 90,
  ramWarning: 75,
  diskCritical: 90,
  diskWarning: 75,
  heartbeatTimeoutSeconds: 300, // 5 minutes
};

/**
 * Calculate health status for a server.
 */
export async function getServerHealth(serverId: string): Promise<ServerHealth> {
  // Fetch latest metric and heartbeat
  const [metric, heartbeat] = await Promise.all([
    prisma.serverMetric.findFirst({
      where: { serverId },
      orderBy: { recordedAt: "desc" },
      take: 1,
    }),
    prisma.serverHeartbeat.findFirst({
      where: { serverId },
      orderBy: { timestamp: "desc" },
      take: 1,
    }),
  ]);

  const reasons: string[] = [];
  let score = 100;

  // Check heartbeat timeout
  const now = new Date();
  const lastHeartbeat = heartbeat?.timestamp;
  const secondsWithoutHeartbeat = lastHeartbeat
    ? Math.floor((now.getTime() - lastHeartbeat.getTime()) / 1000)
    : Infinity;

  if (secondsWithoutHeartbeat > HEALTH_THRESHOLDS.heartbeatTimeoutSeconds) {
    reasons.push(`No heartbeat for ${secondsWithoutHeartbeat} seconds`);
    score -= 50;
  }

  // Check metrics if available
  if (metric) {
    if (metric.cpuPercent > HEALTH_THRESHOLDS.cpuCritical) {
      reasons.push(`High CPU usage (${metric.cpuPercent.toFixed(1)}%)`);
      score -= 30;
    } else if (metric.cpuPercent > HEALTH_THRESHOLDS.cpuWarning) {
      reasons.push(`Elevated CPU usage (${metric.cpuPercent.toFixed(1)}%)`);
      score -= 15;
    }

    if (metric.ramPercent > HEALTH_THRESHOLDS.ramCritical) {
      reasons.push(`High memory usage (${metric.ramPercent.toFixed(1)}%)`);
      score -= 30;
    } else if (metric.ramPercent > HEALTH_THRESHOLDS.ramWarning) {
      reasons.push(`Elevated memory usage (${metric.ramPercent.toFixed(1)}%)`);
      score -= 15;
    }

    if (metric.diskPercent > HEALTH_THRESHOLDS.diskCritical) {
      reasons.push(`High disk usage (${metric.diskPercent.toFixed(1)}%)`);
      score -= 30;
    } else if (metric.diskPercent > HEALTH_THRESHOLDS.diskWarning) {
      reasons.push(`Elevated disk usage (${metric.diskPercent.toFixed(1)}%)`);
      score -= 15;
    }
  }

  // Determine status
  let status: HealthStatus = "healthy";
  if (secondsWithoutHeartbeat > HEALTH_THRESHOLDS.heartbeatTimeoutSeconds) {
    status = "offline";
  } else if (score < 50) {
    status = "critical";
  } else if (score < 80) {
    status = "warning";
  }

  return {
    serverId,
    status,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    lastHeartbeat,
    secondsWithoutHeartbeat:
      secondsWithoutHeartbeat === Infinity ? undefined : secondsWithoutHeartbeat,
  };
}

/**
 * Get health status for multiple servers (useful for dashboards).
 */
export async function getServersHealth(
  serverIds: string[]
): Promise<ServerHealth[]> {
  return Promise.all(serverIds.map((id) => getServerHealth(id)));
}

/**
 * Get overall health for an organization (simple average).
 */
export async function getOrganizationHealth(organizationId: string): Promise<{
  overallStatus: HealthStatus;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  offlineCount: number;
  averageScore: number;
}> {
  // Fetch all servers in organization
  const servers = await prisma.server.findMany({
    where: { organizationId },
    select: { id: true },
  });

  const healths = await getServersHealth(servers.map((s) => s.id));

  const counts = {
    healthy: 0,
    warning: 0,
    critical: 0,
    offline: 0,
  };

  let totalScore = 0;

  for (const h of healths) {
    counts[h.status]++;
    totalScore += h.score;
  }

  const averageScore = healths.length > 0 ? totalScore / healths.length : 0;

  // Overall status determination
  let overallStatus: HealthStatus = "healthy";
  if (counts.critical > 0) overallStatus = "critical";
  else if (counts.offline > 0) overallStatus = "warning";
  else if (counts.warning > 0) overallStatus = "warning";

  return {
    overallStatus,
    healthyCount: counts.healthy,
    warningCount: counts.warning,
    criticalCount: counts.critical,
    offlineCount: counts.offline,
    averageScore,
  };
}
