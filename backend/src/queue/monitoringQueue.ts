/**
 * monitoringQueue.ts
 *
 * Narrow async boundary for agent ingestion. Today this uses an in-process
 * queue; the API/controllers only enqueue jobs, so BullMQ/Kafka can replace
 * this module later without changing routes or services.
 */

import * as svc from "../servers/serverService";

type MonitoringJob =
  | { type: "heartbeat"; serverId: string; payload: svc.HeartbeatPayload; ip: string }
  | { type: "metric"; serverId: string; payload: svc.MetricIngestPayload }
  | { type: "apps"; serverId: string; payload: svc.AppIngestPayload[] }
  | { type: "logs"; serverId: string; payload: svc.LogIngestPayload[] };

const MAX_QUEUE_SIZE = 10000; // Backpressure: drop oldest jobs if queue grows too large
const pending: MonitoringJob[] = [];
let draining = false;

export function enqueueMonitoringJob(job: MonitoringJob): void {
  // Backpressure: if queue is too large, drop oldest entries (prevents OOM)
  if (pending.length >= MAX_QUEUE_SIZE) {
    pending.shift(); // Drop oldest
  }
  pending.push(job);
  if (!draining) {
    draining = true;
    setImmediate(() => {
      void drain();
    });
  }
}

async function drain(): Promise<void> {
  try {
    while (pending.length > 0) {
      const job = pending.shift();
      if (!job) continue;
      try {
        if (job.type === "heartbeat") {
          await svc.recordHeartbeat(job.serverId, job.payload, job.ip);
        } else if (job.type === "metric") {
          await svc.saveMetric(job.serverId, job.payload);
        } else if (job.type === "apps") {
          await svc.replaceApps(job.serverId, job.payload);
        } else {
          await svc.appendLogs(job.serverId, job.payload);
        }
      } catch (err) {
        console.error("[monitoringQueue] job failed", job.type, err);
      }
    }
  } finally {
    draining = false;
    if (pending.length > 0) enqueueMonitoringJob(pending.shift()!);
  }
}
