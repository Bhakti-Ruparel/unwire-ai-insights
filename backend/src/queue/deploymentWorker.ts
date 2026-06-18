/**
 * deploymentWorker.ts
 *
 * BullMQ Worker — processes all deployment jobs.
 * Each job type delegates to the appropriate service.
 *
 * Architecture guarantee: the API never executes deployment logic.
 * API → Queue → Worker → Service
 *
 * Concurrency: 3 concurrent jobs (configurable via WORKER_CONCURRENCY env)
 */

import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions, isRedisAvailable } from "./redisClient";
import { QUEUE_NAME, type JobPayload } from "./deploymentQueue";

let _worker: Worker | null = null;

// ─── Bootstrap ─────────────────────────────────────────────────────────────

export async function startDeploymentWorker(): Promise<void> {
  const redisOk = await isRedisAvailable();
  if (!redisOk) {
    console.warn("[deploymentWorker] Redis unavailable — worker not started. Queue features disabled.");
    return;
  }

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? "3", 10);

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection:  getRedisConnectionOptions(),
    concurrency,
  });

  _worker.on("completed",  (job) => console.log(`[worker] ✓ ${job.name} (${job.id}) completed`));
  _worker.on("failed",     (job, err) => console.error(`[worker] ✗ ${job?.name} (${job?.id}) failed:`, err.message));
  _worker.on("error",      (err) => console.error("[worker] Error:", err));

  console.log(`✓ Deployment worker started (concurrency: ${concurrency})`);
}

export async function stopDeploymentWorker(): Promise<void> {
  await _worker?.close();
  _worker = null;
}

// ─── Job dispatcher ────────────────────────────────────────────────────────

async function processJob(job: Job): Promise<void> {
  const type = job.name as JobPayload["type"];
  const data = job.data;

  console.log(`[worker] Processing ${type} (${job.id})`);

  switch (type) {
    case "DEPLOY_PROJECT":
    case "BUILD_PROJECT": {
      const { runDeploymentPipeline } = await import("../deployment/deploymentPipeline");
      await runDeploymentPipeline(data.deploymentId, job);
      break;
    }
    case "RESTART_APPLICATION": {
      const { restartApp } = await import("../deployment/deploymentPipeline");
      await restartApp(data.serverId, data.appName, data.userId);
      break;
    }
    case "SETUP_SSL": {
      const { provisionSsl } = await import("../deployment/sslService");
      await provisionSsl(data.serverId, data.domain, data.certId);
      break;
    }
    case "ROLLBACK_DEPLOYMENT": {
      const { rollbackDeployment } = await import("../deployment/deploymentPipeline");
      await rollbackDeployment(data.deploymentId, data.previousDeploymentId, data.userId);
      break;
    }
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}
