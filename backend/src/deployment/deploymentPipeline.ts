/**
 * deploymentPipeline.ts
 *
 * Production deployment execution engine.
 * Executes real deployment steps via the server agent's HTTP API.
 *
 * Pipeline steps:
 *   1. Validate      — check project, server, agent availability
 *   2. Plan          — AI planner generates DeploymentPlan
 *   3. Generate      — create Dockerfile, docker-compose, nginx, .env
 *   4. Clone         — agent clones repository from GitHub
 *   5. Write Files   — agent writes generated deployment configs
 *   6. Build         — agent builds Docker image
 *   7. Deploy        — agent starts containers (blue-green)
 *   8. Health Check  — verify app responds on expected port
 *   9. Finalize      — register app, update status
 *
 * Blue-green deployment: new container starts alongside old one.
 * Traffic switches only after health check passes.
 * On failure: old container remains running, new one is cleaned up.
 */

import { randomUUID } from "crypto";
import type { Job } from "bullmq";
import { prisma } from "../database/db";
import { planDeployment } from "./deploymentPlanner";
import { generateDeploymentFiles } from "./deploymentGenerator";
import { sendAgentCommand, checkAgentReady } from "./agentClient";
import { appendLogs, upsertApp } from "../servers/serverService";
import { logger } from "../services/logger";

// ─── Step definitions ─────────────────────────────────────────────────────

interface StepDef { name: string; order: number }

const PIPELINE_STEPS: StepDef[] = [
  { name: "Validate",      order: 0 },
  { name: "Plan",          order: 1 },
  { name: "Generate",      order: 2 },
  { name: "Clone",         order: 3 },
  { name: "Write Files",   order: 4 },
  { name: "Build",         order: 5 },
  { name: "Deploy",        order: 6 },
  { name: "Health Check",  order: 7 },
  { name: "Finalize",      order: 8 },
];

// ─── Main pipeline ────────────────────────────────────────────────────────

export async function runDeploymentPipeline(
  deploymentId: string,
  job?: Job
): Promise<void> {
  const log = makeLogger(deploymentId);
  const setProgress = async (p: number) => {
    await prisma.deployment.update({ where: { id: deploymentId }, data: { progress: p } });
    await job?.updateProgress(p);
  };

  await log("info", "Pipeline", "Starting deployment pipeline");

  // Mark RUNNING
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "RUNNING", startedAt: new Date(), progress: 0 },
  });

  const stepIds = await createSteps(deploymentId);

  try {
    // ── Step 0: Validate ────────────────────────────────────────────────
    const dep = await runStep(deploymentId, stepIds[0], "Validate", log, async () => {
      const d = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { project: true, server: true },
      });
      if (!d) throw new Error("Deployment record not found");
      if (!d.project) throw new Error("Project not found");
      if (!d.server) throw new Error("Server not found");

      await log("info", "Validate", `Project: ${d.project.name}, Server: ${d.server.name}`);

      // Check agent availability
      const agentReady = await checkAgentReady(d.serverId);
      if (!agentReady) {
        throw new Error(`Agent on server "${d.server.name}" (${d.server.host}) is not reachable. Ensure the agent is running.`);
      }
      await log("info", "Validate", "✓ Agent is online and ready");

      return d;
    });
    await setProgress(10);

    // ── Step 1: Plan ────────────────────────────────────────────────────
    const plan = await runStep(deploymentId, stepIds[1], "Plan", log, async () => {
      await log("info", "Plan", "Analyzing project for deployment plan");
      const p = await planDeployment(dep.projectId);
      await log("info", "Plan", `Runtime: ${p.runtime}, Port: ${p.port}, DB: ${p.database ?? "none"}`);
      if (p.warnings.length > 0) {
        for (const w of p.warnings) await log("warn", "Plan", `⚠ ${w}`);
      }
      await prisma.deployment.update({ where: { id: deploymentId }, data: { plan: p as any } });
      return p;
    });
    await setProgress(20);

    // ── Step 2: Generate files ──────────────────────────────────────────
    const files = await runStep(deploymentId, stepIds[2], "Generate", log, async () => {
      await log("info", "Generate", "Generating Dockerfile, docker-compose, nginx.conf");
      const generated = generateDeploymentFiles(plan, dep.project!.name);
      await log("info", "Generate", `Generated: ${Object.keys(generated).join(", ")}`);
      await prisma.deployment.update({ where: { id: deploymentId }, data: { generatedFiles: generated as any } });
      return generated;
    });
    await setProgress(28);

    // ── Step 3: Clone repository ────────────────────────────────────────
    const appSlug = dep.project!.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    await runStep(deploymentId, stepIds[3], "Clone", log, async () => {
      const repoUrl = dep.project!.githubUrl;
      if (!repoUrl) {
        await log("info", "Clone", "No GitHub URL — skipping clone (using uploaded source)");
        return;
      }

      await log("info", "Clone", `Cloning ${repoUrl} (branch: ${dep.branch})`);
      const result = await sendAgentCommand(dep.serverId, {
        deploymentId,
        action: "clone",
        repository: repoUrl,
        branch: dep.branch,
        appName: appSlug,
        timeout: 120,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Clone failed: ${result.error ?? result.stderr}`);
      }
      await log("info", "Clone", "✓ Repository cloned");
    });
    await setProgress(38);

    // ── Step 4: Write deployment files ──────────────────────────────────
    await runStep(deploymentId, stepIds[4], "Write Files", log, async () => {
      await log("info", "Write Files", "Writing Dockerfile, docker-compose.yml, .env");
      const result = await sendAgentCommand(dep.serverId, {
        deploymentId,
        action: "write_files",
        files: files as any,
        envVars: buildEnvMap(plan.environmentVariables),
        appName: appSlug,
        timeout: 30,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Write files failed: ${result.error ?? result.stderr}`);
      }
      await log("info", "Write Files", "✓ Deployment files written");
    });
    await setProgress(45);

    // ── Step 5: Build Docker image ──────────────────────────────────────
    await runStep(deploymentId, stepIds[5], "Build", log, async () => {
      await log("info", "Build", "Building Docker image on server...");
      const result = await sendAgentCommand(dep.serverId, {
        deploymentId,
        action: "build",
        appName: appSlug,
        timeout: 600, // 10 min max for builds
      });

      if (result.exitCode !== 0) {
        throw new Error(`Docker build failed: ${result.error ?? result.stderr}`);
      }

      // Log build output (truncated)
      if (result.stdout) {
        const lines = result.stdout.split("\n").slice(-5);
        for (const line of lines) {
          if (line.trim()) await log("info", "Build", line.trim());
        }
      }
      await log("info", "Build", `✓ Image built in ${(result.durationMs / 1000).toFixed(1)}s`);
    });
    await setProgress(65);

    // ── Step 6: Deploy (blue-green) ─────────────────────────────────────
    await runStep(deploymentId, stepIds[6], "Deploy", log, async () => {
      await log("info", "Deploy", "Starting container (blue-green deployment)...");
      const result = await sendAgentCommand(dep.serverId, {
        deploymentId,
        action: "deploy",
        appName: appSlug,
        port: plan.port,
        timeout: 120,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Deploy failed: ${result.error ?? result.stderr}`);
      }
      await log("info", "Deploy", `✓ Container started on port ${plan.port}`);
    });
    await setProgress(80);

    // ── Step 7: Health check ────────────────────────────────────────────
    await runStep(deploymentId, stepIds[7], "Health Check", log, async () => {
      await log("info", "Health Check", `Checking health on port ${plan.port}...`);
      const result = await sendAgentCommand(dep.serverId, {
        deploymentId,
        action: "healthcheck",
        appName: appSlug,
        port: plan.port,
        timeout: 60,
      });

      if (result.exitCode !== 0) {
        // Health check failed — rollback
        await log("error", "Health Check", "Health check failed. Rolling back...");
        await sendAgentCommand(dep.serverId, {
          deploymentId,
          action: "stop",
          appName: appSlug,
          timeout: 30,
        });
        throw new Error("Health check failed — deployment rolled back.");
      }
      await log("info", "Health Check", "✓ Application is healthy");
    });
    await setProgress(92);

    // ── Step 8: Finalize ────────────────────────────────────────────────
    await runStep(deploymentId, stepIds[8], "Finalize", log, async () => {
      // Register the deployed app in server_apps
      await upsertApp(dep.serverId, {
        name: dep.project!.name,
        type: plan.runtime,
        status: "running",
        port: plan.port,
        pid: null,
        uptime: "just deployed",
        memory: 0,
        cpu: 0,
        lastAction: "deployed",
      });

      // Log to server logs
      await appendLogs(dep.serverId, [{
        appName: dep.project!.name,
        level: "info",
        message: `Deployment v${dep.version} completed successfully`,
      }]);

      await log("info", "Finalize", "✓ Application registered and deployment finalized");
    });
    await setProgress(100);

    // ── Mark SUCCESS ───────────────────────────────────────────────────
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "SUCCESS", completedAt: new Date(), progress: 100 },
    });
    await log("info", "Pipeline", "✓ Deployment successful");

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log("error", "Pipeline", `✗ Deployment failed: ${msg}`);
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "FAILED", completedAt: new Date(), error: msg },
    });
    throw err; // BullMQ handles retries
  }
}

// ─── Rollback ─────────────────────────────────────────────────────────────

export async function rollbackDeployment(
  currentDeploymentId: string,
  previousDeploymentId: string,
  userId: string
): Promise<void> {
  const log = makeLogger(currentDeploymentId);
  await log("info", "Rollback", `Rolling back to deployment ${previousDeploymentId}`);

  const current = await prisma.deployment.findUnique({
    where: { id: currentDeploymentId },
    include: { project: true, server: true },
  });
  if (!current) throw new Error("Deployment not found");

  const appSlug = current.project!.name.toLowerCase().replace(/[^a-z0-9]/g, "-");

  await prisma.deployment.update({
    where: { id: currentDeploymentId },
    data: { status: "RUNNING", progress: 0 },
  });

  const result = await sendAgentCommand(current.serverId, {
    deploymentId: currentDeploymentId,
    action: "rollback",
    appName: appSlug,
    timeout: 60,
  });

  if (result.exitCode !== 0) {
    await log("error", "Rollback", `Rollback failed: ${result.error}`);
    throw new Error(`Rollback failed: ${result.error}`);
  }

  await prisma.deployment.update({
    where: { id: currentDeploymentId },
    data: { status: "ROLLED_BACK", completedAt: new Date(), progress: 100 },
  });

  await log("info", "Rollback", "✓ Rollback complete");
}

// ─── Restart application ──────────────────────────────────────────────────

export async function restartApp(
  serverId: string,
  appName: string,
  userId: string
): Promise<void> {
  const appSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  await appendLogs(serverId, [{
    appName,
    level: "info",
    message: `Restart triggered by user ${userId}`,
  }]);

  const result = await sendAgentCommand(serverId, {
    deploymentId: randomUUID(),
    action: "stop",
    appName: appSlug,
    timeout: 30,
  });

  // Start it again
  await sendAgentCommand(serverId, {
    deploymentId: randomUUID(),
    action: "deploy",
    appName: appSlug,
    port: 3000,
    timeout: 60,
  });

  const { updateAppStatus } = await import("../servers/serverService");
  await updateAppStatus(serverId, appName, "running", "restarted");
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function createSteps(deploymentId: string): Promise<string[]> {
  const ids: string[] = [];
  const data = PIPELINE_STEPS.map((s) => {
    const id = randomUUID();
    ids.push(id);
    return { id, deploymentId, name: s.name, order: s.order, status: "pending" };
  });
  await prisma.deploymentStep.createMany({ data });
  return ids;
}

async function runStep<T>(
  deploymentId: string,
  stepId: string,
  stepName: string,
  log: ReturnType<typeof makeLogger>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  await prisma.deploymentStep.update({
    where: { id: stepId },
    data: { status: "running", startedAt: new Date() },
  });
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    await prisma.deploymentStep.update({
      where: { id: stepId },
      data: { status: "success", completedAt: new Date(), durationMs },
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    await prisma.deploymentStep.update({
      where: { id: stepId },
      data: { status: "failed", completedAt: new Date(), durationMs, error: msg },
    });
    await log("error", stepName, `Failed: ${msg}`);
    throw err;
  }
}

function makeLogger(deploymentId: string) {
  return async (level: string, stepName: string, message: string) => {
    await prisma.deploymentLog.create({
      data: { id: randomUUID(), deploymentId, level, stepName, message },
    });
    logger.info(`[deploy:${deploymentId.slice(0, 8)}] [${stepName}] ${message}`);
  };
}

function buildEnvMap(envVars: Array<{ key: string; example: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of envVars) {
    map[v.key] = v.example; // In production, user provides real values
  }
  return map;
}
