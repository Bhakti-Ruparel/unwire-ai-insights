/**
 * deploymentQueue.ts
 *
 * In-process async job queue for deployment analysis.
 *
 * Design:
 *  - Simple EventEmitter-based queue (no external broker needed for Phase 4)
 *  - Jobs are processed one-at-a-time per project to avoid race conditions
 *  - Non-blocking: the HTTP request returns immediately; worker runs in background
 *  - Future: swap the in-process queue for BullMQ/Redis without changing callers
 *
 * Usage:
 *   enqueueDeploymentJob(projectId)   ← from project service after analysis
 *   The worker picks it up and calls deploymentService.runDeploymentAnalysis()
 */

import { EventEmitter } from "events";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeploymentJob {
  projectId: string;
  attempts:  number;
  enqueuedAt: number;
}

// ─── Queue state ───────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

// Simple FIFO queue (in-memory, survives only for the process lifetime)
const queue: DeploymentJob[] = [];
const inFlight = new Set<string>(); // projectIds currently being processed
const emitter = new EventEmitter();

let workerRunning = false;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * enqueueDeploymentJob
 *
 * Adds a deployment analysis job to the queue and wakes the worker.
 * Safe to call multiple times for the same project — de-duplicates.
 */
export function enqueueDeploymentJob(projectId: string): void {
  // Skip if already queued or in-flight
  if (inFlight.has(projectId) || queue.some((j) => j.projectId === projectId)) {
    console.log(`[deploymentQueue] Job already queued/running for project ${projectId}`);
    return;
  }

  queue.push({ projectId, attempts: 0, enqueuedAt: Date.now() });
  console.log(`[deploymentQueue] Enqueued deployment job for project ${projectId} (queue size: ${queue.length})`);

  // Wake the worker
  if (!workerRunning) {
    workerRunning = true;
    setImmediate(() => processQueue());
  }
}

/**
 * getQueueStatus — for health/debug endpoints
 */
export function getQueueStatus() {
  return {
    queued:   queue.map((j) => j.projectId),
    inFlight: [...inFlight],
    size:     queue.length,
  };
}

// ─── Worker loop ───────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift()!;

    if (inFlight.has(job.projectId)) {
      // Re-queue — concurrent run for same project
      queue.push(job);
      await sleep(500);
      continue;
    }

    inFlight.add(job.projectId);
    job.attempts++;

    try {
      await runJob(job);
    } catch (err) {
      console.error(`[deploymentQueue] Job failed for ${job.projectId} (attempt ${job.attempts}):`, err);

      if (job.attempts < MAX_ATTEMPTS) {
        console.log(`[deploymentQueue] Retrying project ${job.projectId} in ${RETRY_DELAY_MS}ms`);
        setTimeout(() => {
          queue.push(job);
          if (!workerRunning) {
            workerRunning = true;
            setImmediate(() => processQueue());
          }
        }, RETRY_DELAY_MS);
      } else {
        console.error(`[deploymentQueue] Max attempts reached for project ${job.projectId} — marking failed`);
        await markFailed(job.projectId);
      }
    } finally {
      inFlight.delete(job.projectId);
    }
  }

  workerRunning = false;
}

async function runJob(job: DeploymentJob): Promise<void> {
  // Lazy import to avoid circular deps at module load time
  const { runDeploymentAnalysis } = await import("../deployment/deploymentService");
  await runDeploymentAnalysis(job.projectId);
}

async function markFailed(projectId: string): Promise<void> {
  try {
    const { prisma } = await import("../database/db");
    await prisma.deploymentAnalysis.upsert({
      where:  { projectId },
      create: { id: require("crypto").randomUUID(), projectId, status: "failed" },
      update: { status: "failed" },
    });
  } catch {
    // DB might not have the record yet — ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
