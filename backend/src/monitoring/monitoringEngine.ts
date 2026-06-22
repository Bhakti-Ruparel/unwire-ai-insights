/**
 * monitoringEngine.ts
 *
 * Background monitoring engine that continuously analyzes infrastructure.
 * Runs on a timer (every 60s) and checks all servers for anomalies.
 *
 * Responsibilities:
 *  - Detect high CPU/RAM/disk
 *  - Detect server offline
 *  - Detect application crashes
 *  - Detect error spikes in logs
 *  - Detect failed deployments
 *  - Generate alerts + incidents automatically
 *
 * Uses existing database models. Does NOT duplicate any system.
 */

import { prisma } from "../database/db";
import { createAlert, type AlertSeverity, type AlertType } from "./alertService";

const CHECK_INTERVAL_MS = 60_000; // 1 minute
let _timer: ReturnType<typeof setInterval> | null = null;

// ─── Thresholds ───────────────────────────────────────────────────────────

const THRESHOLDS = {
  cpu: { warning: 75, critical: 90 },
  ram: { warning: 80, critical: 95 },
  disk: { warning: 85, critical: 95 },
  heartbeatTimeout: 300,        // 5 minutes = offline
  errorSpikeCount: 10,          // 10+ errors in last 5 min
};

// ─── Start / Stop ─────────────────────────────────────────────────────────

export function startMonitoringEngine(): void {
  if (_timer) return;
  console.log("✓ Monitoring engine started (interval: 60s)");
  _timer = setInterval(runMonitoringCycle, CHECK_INTERVAL_MS);
  // Run first check after 10s startup delay
  setTimeout(runMonitoringCycle, 10_000);
}

export function stopMonitoringEngine(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ─── Main cycle ───────────────────────────────────────────────────────────

async function runMonitoringCycle(): Promise<void> {
  try {
    // Get all servers grouped by user
    const servers = await prisma.server.findMany({
      where: { userId: { not: null } },
      select: { id: true, userId: true, name: true, status: true, organizationId: true },
    });

    for (const server of servers) {
      if (!server.userId) continue;
      await checkServer(server as any);
    }

    // Check for failed deployments
    await checkFailedDeployments();
  } catch (err) {
    console.error("[monitoringEngine] Cycle error:", err);
  }
}

// ─── Server checks ────────────────────────────────────────────────────────

interface ServerRef {
  id: string;
  userId: string;
  name: string;
  status: string;
  organizationId: string | null;
}

async function checkServer(server: ServerRef): Promise<void> {
  const [latestMetric, latestHeartbeat, recentErrors, crashedApps] = await Promise.all([
    prisma.serverMetric.findFirst({
      where: { serverId: server.id },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.serverHeartbeat.findFirst({
      where: { serverId: server.id },
      orderBy: { timestamp: "desc" },
    }),
    prisma.serverLog.count({
      where: {
        serverId: server.id,
        level: "error",
        timestamp: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    }),
    prisma.serverApp.findMany({
      where: { serverId: server.id, status: { in: ["error", "stopped"] } },
      select: { name: true, status: true },
    }),
  ]);

  // ── Check heartbeat (offline detection) ─────────────────────────────────
  if (latestHeartbeat) {
    const secsSince = (Date.now() - latestHeartbeat.timestamp.getTime()) / 1000;
    if (secsSince > THRESHOLDS.heartbeatTimeout) {
      await createAlert({
        userId: server.userId,
        organizationId: server.organizationId ?? undefined,
        serverId: server.id,
        type: "server_offline",
        severity: "CRITICAL",
        title: `Server "${server.name}" is offline`,
        message: `No heartbeat received for ${Math.round(secsSince / 60)} minutes. The server may have crashed or lost network connectivity.`,
        recommendation: "Check server accessibility via SSH. Verify the monitoring agent is running.",
        metadata: { lastHeartbeat: latestHeartbeat.timestamp.toISOString(), secondsSince: secsSince },
      });
    }
  }

  if (!latestMetric) return; // No metrics yet

  // ── CPU check ───────────────────────────────────────────────────────────
  if (latestMetric.cpuPercent >= THRESHOLDS.cpu.critical) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "cpu_high", severity: "CRITICAL",
      title: `Critical CPU on "${server.name}" (${latestMetric.cpuPercent.toFixed(0)}%)`,
      message: `CPU usage has reached ${latestMetric.cpuPercent.toFixed(1)}%, which may cause request timeouts and service degradation.`,
      recommendation: "Identify top CPU-consuming processes. Consider scaling horizontally or vertically.",
      metadata: { cpuPercent: latestMetric.cpuPercent },
    });
  } else if (latestMetric.cpuPercent >= THRESHOLDS.cpu.warning) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "cpu_high", severity: "WARNING",
      title: `High CPU on "${server.name}" (${latestMetric.cpuPercent.toFixed(0)}%)`,
      message: `CPU usage is elevated at ${latestMetric.cpuPercent.toFixed(1)}%. Not critical yet but worth monitoring.`,
      recommendation: "Monitor CPU trends. Check for background jobs or traffic spikes.",
      metadata: { cpuPercent: latestMetric.cpuPercent },
    });
  }

  // ── RAM check ───────────────────────────────────────────────────────────
  if (latestMetric.ramPercent >= THRESHOLDS.ram.critical) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "ram_high", severity: "CRITICAL",
      title: `Critical memory on "${server.name}" (${latestMetric.ramPercent.toFixed(0)}%)`,
      message: `Memory usage at ${latestMetric.ramPercent.toFixed(1)}%. Applications risk being OOM-killed.`,
      recommendation: "Restart the highest-memory service as an immediate fix. Investigate memory leaks.",
      metadata: { ramPercent: latestMetric.ramPercent },
    });
  } else if (latestMetric.ramPercent >= THRESHOLDS.ram.warning) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "ram_high", severity: "WARNING",
      title: `High memory on "${server.name}" (${latestMetric.ramPercent.toFixed(0)}%)`,
      message: `Memory usage is elevated at ${latestMetric.ramPercent.toFixed(1)}%.`,
      recommendation: "Review application memory limits. Check for cache growth or connection leaks.",
      metadata: { ramPercent: latestMetric.ramPercent },
    });
  }

  // ── Disk check ──────────────────────────────────────────────────────────
  if (latestMetric.diskPercent >= THRESHOLDS.disk.critical) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "disk_high", severity: "CRITICAL",
      title: `Disk nearly full on "${server.name}" (${latestMetric.diskPercent.toFixed(0)}%)`,
      message: `Disk usage at ${latestMetric.diskPercent.toFixed(1)}%. Services may fail to write data.`,
      recommendation: "Clean old logs, Docker images, and temp files. Check for runaway log growth.",
      metadata: { diskPercent: latestMetric.diskPercent },
    });
  }

  // ── Error spike check ───────────────────────────────────────────────────
  if (recentErrors >= THRESHOLDS.errorSpikeCount) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "error_spike", severity: "WARNING",
      title: `Error spike on "${server.name}" (${recentErrors} errors in 5 min)`,
      message: `Detected ${recentErrors} errors in the last 5 minutes. This may indicate a service issue.`,
      recommendation: "Check application logs for recurring error patterns. A recent deployment may have introduced a bug.",
      metadata: { errorCount: recentErrors },
    });
  }

  // ── App crash check ─────────────────────────────────────────────────────
  for (const app of crashedApps) {
    await createAlert({
      userId: server.userId, organizationId: server.organizationId ?? undefined,
      serverId: server.id, type: "app_crash", severity: "CRITICAL",
      title: `Application "${app.name}" crashed on "${server.name}"`,
      message: `The application "${app.name}" is in "${app.status}" state.`,
      recommendation: "Check application logs for the crash reason. Consider restarting the service.",
      metadata: { appName: app.name, appStatus: app.status },
    });
  }
}

// ─── Deployment checks ────────────────────────────────────────────────────

async function checkFailedDeployments(): Promise<void> {
  // Find recently failed deployments (last 5 min) that haven't been alerted
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const failedDeps = await prisma.deployment.findMany({
    where: {
      status: "FAILED",
      completedAt: { gte: cutoff },
    },
    select: {
      id: true, userId: true, version: true, error: true,
      project: { select: { name: true, id: true, organizationId: true } },
      server: { select: { name: true, id: true } },
    },
    take: 20,
  });

  for (const dep of failedDeps) {
    await createAlert({
      userId: dep.userId,
      organizationId: dep.project.organizationId ?? undefined,
      serverId: dep.server.id,
      projectId: dep.project.id,
      type: "deploy_failed",
      severity: "WARNING",
      title: `Deployment v${dep.version} failed for "${dep.project.name}"`,
      message: `Deployment to "${dep.server.name}" failed${dep.error ? `: ${dep.error.slice(0, 200)}` : ""}.`,
      recommendation: "Review deployment logs for the failure reason. Consider rolling back to the previous version.",
      metadata: { deploymentId: dep.id, version: dep.version },
    });
  }
}
