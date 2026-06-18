/**
 * deploymentExecutionService.ts
 *
 * Database layer for Deployment execution records.
 * All queries are paginated / cursor-based — never load all rows.
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";
import { enqueue } from "../queue/deploymentQueue";
import { planDeployment } from "./deploymentPlanner";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeploymentDTO {
  id:          string;
  projectId:   string;
  serverId:    string;
  userId:      string;
  version:     number;
  status:      string;
  progress:    number;
  branch:      string;
  environment: string;
  error?:      string | null;
  startedAt?:  string | null;
  completedAt?: string | null;
  createdAt:   string;
  projectName: string;
  serverName:  string;
  steps:       StepDTO[];
}

export interface StepDTO {
  id:          string;
  name:        string;
  status:      string;
  order:       number;
  durationMs?: number | null;
  error?:      string | null;
}

export interface LogDTO {
  id:          string;
  level:       string;
  message:     string;
  stepName:    string;
  timestamp:   string;
}

// ─── Create & enqueue ──────────────────────────────────────────────────────

export async function createDeployment(opts: {
  projectId:   string;
  serverId:    string;
  userId:      string;
  branch?:     string;
  environment?: string;
}): Promise<DeploymentDTO> {
  // Check project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: opts.projectId, userId: opts.userId },
  });
  if (!project) throw new Error("Project not found or access denied.");

  const server = await prisma.server.findFirst({
    where: { id: opts.serverId, userId: opts.userId },
  });
  if (!server) throw new Error("Server not found or access denied.");

  // Auto-increment version per project
  const lastDep = await prisma.deployment.findFirst({
    where:   { projectId: opts.projectId },
    orderBy: { version: "desc" },
    select:  { version: true },
  });
  const version = (lastDep?.version ?? 0) + 1;

  const dep = await prisma.deployment.create({
    data: {
      id:          randomUUID(),
      projectId:   opts.projectId,
      serverId:    opts.serverId,
      userId:      opts.userId,
      version,
      status:      "QUEUED",
      progress:    0,
      branch:      opts.branch      ?? "main",
      environment: opts.environment ?? "production",
    },
    include: {
      project: { select: { name: true } },
      server:  { select: { name: true } },
    },
  });

  // Enqueue BullMQ job (non-blocking)
  // Falls back to in-process execution if Redis is unavailable
  enqueue({
    type: "DEPLOY_PROJECT",
    data: {
      deploymentId: dep.id,
      projectId:    opts.projectId,
      serverId:     opts.serverId,
      userId:       opts.userId,
      branch:       dep.branch,
      environment:  dep.environment,
    },
  }).catch(async (err) => {
    console.warn("[deploymentExecutionService] Queue unavailable, running pipeline in-process:", err.message);
    // Run directly in background — non-blocking
    const { runDeploymentPipeline } = await import("./deploymentPipeline");
    runDeploymentPipeline(dep.id).catch((pipeErr) => {
      console.error("[deploymentExecutionService] In-process pipeline failed:", pipeErr);
    });
  });

  return toDTO(dep);
}

// ─── Queries ───────────────────────────────────────────────────────────────

/** List deployments for a project — cursor paginated */
export async function listDeployments(opts: {
  projectId: string;
  userId:    string;
  cursor?:   string;   // deploymentId for cursor pagination
  limit?:    number;
}): Promise<{ deployments: DeploymentDTO[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 20, 100);

  const rows = await prisma.deployment.findMany({
    where:  { projectId: opts.projectId, userId: opts.userId },
    orderBy: { createdAt: "desc" },
    take:    limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      project: { select: { name: true } },
      server:  { select: { name: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });

  const hasMore = rows.length > limit;
  const data    = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { deployments: data.map(toDTO), nextCursor };
}

/** Single deployment with steps */
export async function getDeployment(id: string, userId: string): Promise<DeploymentDTO | null> {
  const dep = await prisma.deployment.findFirst({
    where:   { id, userId },
    include: {
      project: { select: { name: true } },
      server:  { select: { name: true } },
      steps:   { orderBy: { order: "asc" } },
    },
  });
  if (!dep) return null;
  return toDTO(dep);
}

/** Logs — cursor paginated, newest first */
export async function getDeploymentLogs(opts: {
  deploymentId: string;
  userId:       string;
  cursor?:      string;
  limit?:       number;
}): Promise<{ logs: LogDTO[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 500);

  // Verify ownership
  const dep = await prisma.deployment.findFirst({ where: { id: opts.deploymentId, userId: opts.userId } });
  if (!dep) return { logs: [], nextCursor: null };

  const rows = await prisma.deploymentLog.findMany({
    where:   { deploymentId: opts.deploymentId },
    orderBy: { timestamp: "asc" },
    take:    limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const data    = hasMore ? rows.slice(0, limit) : rows;

  return {
    logs: data.map((l) => ({
      id:        l.id,
      level:     l.level,
      message:   l.message,
      stepName:  l.stepName,
      timestamp: l.timestamp.toISOString(),
    })),
    nextCursor: hasMore ? data[data.length - 1].id : null,
  };
}

/** Get the deployment plan for a project (preview before deploy) */
export async function previewDeploymentPlan(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new Error("Project not found or access denied.");
  return planDeployment(projectId);
}

/** Rollback to a previous successful deployment */
export async function rollback(deploymentId: string, userId: string): Promise<DeploymentDTO> {
  const current = await prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
    include: { project: { select: { name: true } }, server: { select: { name: true } } },
  });
  if (!current) throw new Error("Deployment not found or access denied.");

  // Find last successful deployment for this project
  const previous = await prisma.deployment.findFirst({
    where:   { projectId: current.projectId, status: "SUCCESS", id: { not: deploymentId } },
    orderBy: { createdAt: "desc" },
  });
  if (!previous) throw new Error("No previous successful deployment found for rollback.");

  // Create rollback deployment record
  const version = (await prisma.deployment.findFirst({
    where: { projectId: current.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  }))?.version ?? 0;

  const rollbackDep = await prisma.deployment.create({
    data: {
      id:          randomUUID(),
      projectId:   current.projectId,
      serverId:    current.serverId,
      userId,
      version:     version + 1,
      status:      "QUEUED",
      progress:    0,
      branch:      current.branch,
      environment: current.environment,
    },
    include: {
      project: { select: { name: true } },
      server:  { select: { name: true } },
    },
  });

  enqueue({
    type: "ROLLBACK_DEPLOYMENT",
    data: {
      deploymentId:         rollbackDep.id,
      previousDeploymentId: previous.id,
      userId,
    },
  }).catch(async (err) => {
    console.warn("[rollback] Queue unavailable, running in-process:", err.message);
    const { rollbackDeployment } = await import("./deploymentPipeline");
    rollbackDeployment(rollbackDep.id, previous.id, userId).catch((e) => {
      console.error("[rollback] In-process rollback failed:", e);
    });
  });

  return toDTO({ ...rollbackDep, steps: [] });
}

// ─── Admin stats ──────────────────────────────────────────────────────────

export async function getDeploymentStats() {
  const [total, failed, succeeded, running] = await Promise.all([
    prisma.deployment.count(),
    prisma.deployment.count({ where: { status: "FAILED" } }),
    prisma.deployment.count({ where: { status: "SUCCESS" } }),
    prisma.deployment.count({ where: { status: "RUNNING" } }),
  ]);

  // Avg duration for successful deployments
  const durations = await prisma.deployment.findMany({
    where:  { status: "SUCCESS", startedAt: { not: null }, completedAt: { not: null } },
    select: { startedAt: true, completedAt: true },
    take:   100,
    orderBy: { createdAt: "desc" },
  });

  let avgDurationMs = 0;
  if (durations.length > 0) {
    const sum = durations.reduce((acc, d) => {
      if (d.startedAt && d.completedAt) {
        return acc + (d.completedAt.getTime() - d.startedAt.getTime());
      }
      return acc;
    }, 0);
    avgDurationMs = Math.floor(sum / durations.length);
  }

  return { total, failed, succeeded, running, avgDurationMs };
}

// ─── DTO helper ────────────────────────────────────────────────────────────

function toDTO(dep: any): DeploymentDTO {
  return {
    id:          dep.id,
    projectId:   dep.projectId,
    serverId:    dep.serverId,
    userId:      dep.userId,
    version:     dep.version,
    status:      dep.status,
    progress:    dep.progress,
    branch:      dep.branch,
    environment: dep.environment,
    error:       dep.error,
    startedAt:   dep.startedAt?.toISOString() ?? null,
    completedAt: dep.completedAt?.toISOString() ?? null,
    createdAt:   dep.createdAt.toISOString(),
    projectName: dep.project?.name ?? "",
    serverName:  dep.server?.name  ?? "",
    steps: (dep.steps ?? []).map((s: any) => ({
      id:         s.id,
      name:       s.name,
      status:     s.status,
      order:      s.order,
      durationMs: s.durationMs,
      error:      s.error,
    })),
  };
}
