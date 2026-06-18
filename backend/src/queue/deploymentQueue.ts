/**
 * deploymentQueue.ts  (Phase 6 — BullMQ + Redis)
 *
 * Production queue replacing the Phase 4 in-process EventEmitter queue.
 * Every deploy job is isolated, retried automatically, and persisted in Redis.
 *
 * Job types:
 *   DEPLOY_PROJECT       — full deploy pipeline (plan → generate files → run on server)
 *   BUILD_PROJECT        — build only (no deploy)
 *   RESTART_APPLICATION  — restart existing app on server
 *   SETUP_SSL            — provision SSL certificate for a domain
 *   ROLLBACK_DEPLOYMENT  — restore previous successful deployment
 *
 * Workers are in deploymentWorker.ts — queue never executes logic directly.
 */

import { Queue, QueueEvents } from "bullmq";
import { getRedisConnectionOptions } from "./redisClient";

// ─── Job type registry ─────────────────────────────────────────────────────

export type JobType =
  | "DEPLOY_PROJECT"
  | "BUILD_PROJECT"
  | "RESTART_APPLICATION"
  | "SETUP_SSL"
  | "ROLLBACK_DEPLOYMENT";

export interface DeployProjectPayload {
  deploymentId: string;
  projectId:    string;
  serverId:     string;
  userId:       string;
  branch:       string;
  environment:  string;
}

export interface RestartApplicationPayload {
  serverId:    string;
  appName:     string;
  userId:      string;
}

export interface SetupSslPayload {
  serverId:    string;
  domain:      string;
  userId:      string;
  certId:      string;
}

export interface RollbackDeploymentPayload {
  deploymentId:         string;   // current (to be rolled back)
  previousDeploymentId: string;
  userId:               string;
}

export type JobPayload =
  | { type: "DEPLOY_PROJECT";       data: DeployProjectPayload      }
  | { type: "BUILD_PROJECT";        data: DeployProjectPayload      }
  | { type: "RESTART_APPLICATION";  data: RestartApplicationPayload  }
  | { type: "SETUP_SSL";            data: SetupSslPayload           }
  | { type: "ROLLBACK_DEPLOYMENT";  data: RollbackDeploymentPayload };

// ─── Queue name ────────────────────────────────────────────────────────────

export const QUEUE_NAME = "unwire:deployments";

// ─── Singleton queue ───────────────────────────────────────────────────────

let _queue: Queue | null = null;
let _queueEvents: QueueEvents | null = null;

export function getDeploymentQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail:     { age: 604800 },
    },
  });
  // Suppress connection error noise — Redis unavailability is handled by worker check
  _queue.on("error", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[deploymentQueue] Queue connection error (Redis may be offline):", err.message);
    }
  });
  console.log("[deploymentQueue] BullMQ queue initialised");
  return _queue;
}

export function getQueueEvents(): QueueEvents {
  if (_queueEvents) return _queueEvents;
  _queueEvents = new QueueEvents(QUEUE_NAME, { connection: getRedisConnectionOptions() });
  _queueEvents.on("error", () => {});  // suppress when Redis offline
  return _queueEvents;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * enqueue
 *
 * Adds a typed job to the queue. Returns the BullMQ Job ID.
 * Idempotent for DEPLOY_PROJECT jobs via jobId = deploymentId.
 */
export async function enqueue(job: JobPayload): Promise<string> {
  try {
    const q = getDeploymentQueue();
    const jobId = "deploymentId" in job.data ? `${job.type}:${job.data.deploymentId}` : undefined;
    const added = await q.add(job.type, job.data, { jobId });
    console.log(`[deploymentQueue] Enqueued ${job.type} (BullMQ job: ${added.id})`);
    return added.id ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[deploymentQueue] Could not enqueue ${job.type} (Redis offline?): ${msg}`);
    throw new Error(`Queue unavailable: ${msg}`);
  }
}

/**
 * getJobStatus
 *
 * Returns the current BullMQ state of a job.
 */
export async function getJobStatus(jobId: string): Promise<string> {
  const q = getDeploymentQueue();
  const job = await q.getJob(jobId);
  if (!job) return "not_found";
  return job.getState();
}

/**
 * getQueueHealth
 *
 * Returns counts for admin dashboard.
 */
export async function getQueueHealth() {
  const q = getDeploymentQueue();
  const [waiting, active, failed, completed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getFailedCount(),
    q.getCompletedCount(),
  ]);
  return { waiting, active, failed, completed };
}

// ─── Graceful shutdown ─────────────────────────────────────────────────────

export async function closeQueue(): Promise<void> {
  await _queue?.close();
  await _queueEvents?.close();
}
