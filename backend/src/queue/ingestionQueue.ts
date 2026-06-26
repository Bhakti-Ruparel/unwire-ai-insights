/**
 * ingestionQueue.ts
 *
 * BullMQ queue for agent data ingestion.
 * Offloads heavy metric/process/docker processing from the API request path.
 *
 * Job types:
 *   PROCESS_DISCOVERY   — update server apps from process list
 *   DOCKER_DISCOVERY    — update server apps from Docker containers
 *   METRIC_BATCH        — batch insert metrics (for future high-volume scenarios)
 *
 * Falls back to inline processing if Redis is unavailable.
 */

import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions, isRedisAvailable } from "./redisClient";
import * as svc from "../servers/serverService";
import { logger } from "../services/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export type IngestionJobType = "PROCESS_DISCOVERY" | "DOCKER_DISCOVERY" | "METRIC_BATCH";

export interface IngestionJob {
  type: IngestionJobType;
  serverId: string;
  data: any;
}

// ─── Queue ─────────────────────────────────────────────────────────────────

const QUEUE_NAME = "unwire:ingestion";
let _queue: Queue | null = null;
let _worker: Worker | null = null;

function getQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });
  _queue.on("error", () => {}); // Suppress Redis offline errors
  return _queue;
}

// ─── Enqueue ───────────────────────────────────────────────────────────────

/**
 * Enqueue an ingestion job. Falls back to inline processing if Redis unavailable.
 */
export async function enqueueIngestion(job: IngestionJob): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    // Process inline as fallback
    await processJob(job);
    return;
  }

  const q = getQueue();
  await q.add(job.type, job, {
    jobId: `${job.type}:${job.serverId}:${Date.now()}`,
  });
}

// ─── Worker ────────────────────────────────────────────────────────────────

export async function startIngestionWorker(): Promise<boolean> {
  const available = await isRedisAvailable();
  if (!available) {
    logger.info("Ingestion worker: Redis unavailable, using inline processing");
    return false;
  }

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processJob(job.data as IngestionJob);
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
      limiter: { max: 100, duration: 1000 }, // 100 jobs/second
    }
  );

  _worker.on("failed", (job, err) => {
    logger.warn(`Ingestion job failed: ${job?.name} - ${err.message}`);
  });

  _worker.on("error", () => {}); // Suppress Redis errors
  logger.info("✓ Ingestion worker started (concurrency: 5)");
  return true;
}

// ─── Job processor ─────────────────────────────────────────────────────────

async function processJob(job: IngestionJob): Promise<void> {
  switch (job.type) {
    case "PROCESS_DISCOVERY":
      await handleProcessDiscovery(job.serverId, job.data.processes);
      break;
    case "DOCKER_DISCOVERY":
      await handleDockerDiscovery(job.serverId, job.data.containers);
      break;
    case "METRIC_BATCH":
      // Future: batch metric insertion for high-volume scenarios
      break;
  }
}

async function handleProcessDiscovery(serverId: string, processes: any[]): Promise<void> {
  const apps = processes.slice(0, 100).map((p: any) => ({
    name: p.name ?? "unknown",
    type: detectType(p.name ?? ""),
    status: "running",
    port: p.port ?? null,
    pid: p.pid ?? null,
    uptime: "",
    memory: p.memory ?? 0,
    cpu: p.cpu ?? 0,
  }));

  await svc.replaceApps(serverId, apps);
}

async function handleDockerDiscovery(serverId: string, containers: any[]): Promise<void> {
  const apps = containers.slice(0, 50).map((c: any) => ({
    name: c.name ?? c.id ?? "container",
    type: "docker",
    status: c.state === "running" ? "running" : "stopped",
    port: c.port ?? null,
    pid: null,
    uptime: c.uptime ?? "",
    memory: c.memory ?? 0,
    cpu: c.cpu ?? 0,
  }));

  await svc.replaceApps(serverId, apps);
}

function detectType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("node")) return "node";
  if (n.includes("python")) return "python";
  if (n.includes("nginx")) return "nginx";
  if (n.includes("postgres")) return "postgresql";
  if (n.includes("redis")) return "redis";
  if (n.includes("mongo")) return "mongodb";
  return "process";
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

export async function closeIngestionQueue(): Promise<void> {
  await _worker?.close();
  await _queue?.close();
}
