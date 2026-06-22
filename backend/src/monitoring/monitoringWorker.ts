/**
 * monitoringWorker.ts
 *
 * Production-grade monitoring using BullMQ repeatable jobs.
 * Replaces setInterval with a proper queue job that:
 *  - Won't run in duplicate across multiple instances
 *  - Has retry/failure tracking
 *  - Uses job locking (BullMQ handles this)
 *  - Processes servers in batches to avoid N+1
 *
 * Falls back to in-process monitoring if Redis is unavailable.
 */

import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions, isRedisAvailable } from "../queue/redisClient";
import { prisma } from "../database/db";
import { createAlert } from "./alertService";
import { logger } from "../services/logger";

const QUEUE_NAME = "unwire:monitoring";
const BATCH_SIZE = 50; // Process 50 servers per batch

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// ─── Thresholds (same as monitoringEngine.ts) ─────────────────────────────

const THRESHOLDS = {
  cpu: { warning: 75, critical: 90 },
  ram: { warning: 80, critical: 95 },
  disk: { warning: 85, critical: 95 },
  heartbeatTimeout: 300,
  errorSpikeCount: 10,
};

// ─── Start ────────────────────────────────────────────────────────────────

export async function startMonitoringWorker(): Promise<boolean> {
  const redisOk = await isRedisAvailable();
  if (!redisOk) {
    logger.warn("Redis unavailable — monitoring will use in-process fallback.");
    return false;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: { removeOnComplete: { count: 10 }, removeOnFail: { count: 50 } },
  });
  _queue.on("error", () => {});

  // Add repeatable job — runs every 60s, guaranteed no duplicates
  await _queue.add("monitor-cycle", {}, {
    repeat: { every: 60_000 },
    jobId: "monitor-cycle-repeatable",
  });

  _worker = new Worker(QUEUE_NAME, async () => {
    await runBatchMonitoringCycle();
  }, {
    connection: getRedisConnectionOptions(),
    concurrency: 1, // Only one monitoring cycle at a time
    lockDuration: 55_000, // Lock for 55s (job runs every 60s)
  });

  _worker.on("failed", (job, err) => {
    logger.error(`Monitoring cycle failed: ${err.message}`);
  });

  logger.info("Monitoring worker started (BullMQ repeatable, 60s interval)");
  return true;
}

export async function stopMonitoringWorker(): Promise<void> {
  await _worker?.close();
  await _queue?.close();
}

// ─── Batch monitoring cycle ───────────────────────────────────────────────

async function runBatchMonitoringCycle(): Promise<void> {
  const totalServers = await prisma.server.count({ where: { userId: { not: null } } });
  let processed = 0;

  // Process in batches of 50
  while (processed < totalServers) {
    const servers = await prisma.server.findMany({
      where: { userId: { not: null } },
      select: { id: true, userId: true, name: true, status: true, organizationId: true },
      skip: processed,
      take: BATCH_SIZE,
    });

    if (servers.length === 0) break;

    // Process batch in parallel (each server's checks are parallel internally)
    await Promise.allSettled(
      servers.map((s) => checkServerBatch(s as any))
    );

    processed += servers.length;
  }

  // Check failed deployments
  await checkFailedDeploymentsBatch();
}

// ─── Per-server check (optimized — single query with all needed data) ─────

interface ServerRef {
  id: string;
  userId: string;
  name: string;
  status: string;
  organizationId: string | null;
}

async function checkServerBatch(server: ServerRef): Promise<void> {
  try {
    const [latestMetric, latestHeartbeat, errorCount, crashedApps] = await Promise.all([
      prisma.serverMetric.findFirst({
        where: { serverId: server.id },
        orderBy: { recordedAt: "desc" },
        select: { cpuPercent: true, ramPercent: true, diskPercent: true },
      }),
      prisma.serverHeartbeat.findFirst({
        where: { serverId: server.id },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
      prisma.serverLog.count({
        where: { serverId: server.id, level: "error", timestamp: { gte: new Date(Date.now() - 5 * 60_000) } },
      }),
      prisma.serverApp.findMany({
        where: { serverId: server.id, status: { in: ["error", "stopped"] } },
        select: { name: true, status: true },
        take: 5,
      }),
    ]);

    // Heartbeat check
    if (latestHeartbeat) {
      const secsSince = (Date.now() - latestHeartbeat.timestamp.getTime()) / 1000;
      if (secsSince > THRESHOLDS.heartbeatTimeout) {
        await createAlert({
          userId: server.userId, organizationId: server.organizationId ?? undefined,
          serverId: server.id, type: "server_offline", severity: "CRITICAL",
          title: `Server "${server.name}" is offline`,
          message: `No heartbeat for ${Math.round(secsSince / 60)} minutes.`,
          recommendation: "Check server accessibility. Verify the monitoring agent is running.",
        });
      }
    }

    if (!latestMetric) return;

    // CPU
    if (latestMetric.cpuPercent >= THRESHOLDS.cpu.critical) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "cpu_high", severity: "CRITICAL", title: `Critical CPU on "${server.name}" (${latestMetric.cpuPercent.toFixed(0)}%)`, message: `CPU at ${latestMetric.cpuPercent.toFixed(1)}%.`, recommendation: "Identify top CPU-consuming processes." });
    } else if (latestMetric.cpuPercent >= THRESHOLDS.cpu.warning) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "cpu_high", severity: "WARNING", title: `High CPU on "${server.name}" (${latestMetric.cpuPercent.toFixed(0)}%)`, message: `CPU elevated at ${latestMetric.cpuPercent.toFixed(1)}%.`, recommendation: "Monitor CPU trends." });
    }

    // RAM
    if (latestMetric.ramPercent >= THRESHOLDS.ram.critical) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "ram_high", severity: "CRITICAL", title: `Critical memory on "${server.name}" (${latestMetric.ramPercent.toFixed(0)}%)`, message: `Memory at ${latestMetric.ramPercent.toFixed(1)}%.`, recommendation: "Restart high-memory services. Investigate leaks." });
    }

    // Disk
    if (latestMetric.diskPercent >= THRESHOLDS.disk.critical) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "disk_high", severity: "CRITICAL", title: `Disk full on "${server.name}" (${latestMetric.diskPercent.toFixed(0)}%)`, message: `Disk at ${latestMetric.diskPercent.toFixed(1)}%.`, recommendation: "Clean old logs and Docker images." });
    }

    // Error spike
    if (errorCount >= THRESHOLDS.errorSpikeCount) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "error_spike", severity: "WARNING", title: `Error spike on "${server.name}" (${errorCount} in 5 min)`, message: `${errorCount} errors detected.`, recommendation: "Check application logs." });
    }

    // Crashed apps
    for (const app of crashedApps.slice(0, 3)) {
      await createAlert({ userId: server.userId, organizationId: server.organizationId ?? undefined, serverId: server.id, type: "app_crash", severity: "CRITICAL", title: `"${app.name}" crashed on "${server.name}"`, message: `Application in "${app.status}" state.`, recommendation: "Check logs and consider restarting." });
    }
  } catch (err: any) {
    logger.warn(`Monitoring check failed for server ${server.id}: ${err.message}`);
  }
}

async function checkFailedDeploymentsBatch(): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const failedDeps = await prisma.deployment.findMany({
    where: { status: "FAILED", completedAt: { gte: cutoff } },
    select: { id: true, userId: true, version: true, error: true, project: { select: { name: true, id: true, organizationId: true } }, server: { select: { name: true, id: true } } },
    take: 20,
  });

  for (const dep of failedDeps) {
    await createAlert({ userId: dep.userId, organizationId: dep.project.organizationId ?? undefined, serverId: dep.server.id, projectId: dep.project.id, type: "deploy_failed", severity: "WARNING", title: `Deployment v${dep.version} failed for "${dep.project.name}"`, message: `Failed on "${dep.server.name}"${dep.error ? `: ${dep.error.slice(0, 150)}` : ""}.`, recommendation: "Review deployment logs." });
  }
}
