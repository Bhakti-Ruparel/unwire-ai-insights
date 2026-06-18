/**
 * deploymentService.ts
 *
 * Database layer for deployment analysis.
 * Orchestrates:
 *  1. runDeploymentAnalysis(projectId) — called by the background worker
 *  2. getDeploymentAnalysis(projectId) — called by the API
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";
import { analyzeDeployment } from "./deploymentAnalyzer";
import { projectSourceDir } from "../services/fileService";
import type { DeploymentAnalysisResult } from "./deploymentAnalyzer";

// ─── Types (API response shape) ────────────────────────────────────────────

export interface DeploymentAnalysisDTO {
  projectId:         string;
  status:            string;
  score:             number;
  scoreBreakdown:    Record<string, { score: number; max: number; label: string }>;
  filesDetected:     Array<{ name: string; path: string; category: string }>;
  issues:            Array<{
    id:          string;
    severity:    string;
    category:    string;
    message:     string;
    file:        string;
    line?:       number;
    suggestion:  string;
  }>;
  recommendations:   Array<{
    id:          string;
    priority:    number;
    title:       string;
    description: string;
    category:    string;
    codeSnippet: string;
  }>;
  architectureNodes: unknown[];
  architectureEdges: unknown[];
  updatedAt:         string;
}

// ─── Background worker entry ───────────────────────────────────────────────

/**
 * runDeploymentAnalysis
 *
 * Called exclusively from the background job queue.
 * Never call this from an HTTP handler directly.
 */
export async function runDeploymentAnalysis(projectId: string): Promise<void> {
  console.log(`[deploymentService] Starting analysis for project ${projectId}`);

  // Mark as processing
  const analysisId = randomUUID();
  await prisma.deploymentAnalysis.upsert({
    where:  { projectId },
    create: { id: analysisId, projectId, status: "processing" },
    update: { status: "processing", updatedAt: new Date() },
  });

  try {
    // Get project stack for richer analysis
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const sourceDir = projectSourceDir(projectId);
    const stack     = project.stack ?? [];

    // Run pure analysis (no DB access inside)
    const result: DeploymentAnalysisResult = analyzeDeployment(sourceDir, stack);

    // Find or re-use the analysis record id
    const existing = await prisma.deploymentAnalysis.findUnique({ where: { projectId } });
    const useId = existing?.id ?? analysisId;

    // Persist in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.deploymentAnalysis.upsert({
        where:  { projectId },
        create: {
          id:                useId,
          projectId,
          status:            "complete",
          score:             result.score,
          filesDetected:     result.filesDetected as any,
          scoreBreakdown:    result.scoreBreakdown as any,
          architectureNodes: result.architectureNodes as any,
          architectureEdges: result.architectureEdges as any,
          updatedAt:         new Date(),
        },
        update: {
          status:            "complete",
          score:             result.score,
          filesDetected:     result.filesDetected as any,
          scoreBreakdown:    result.scoreBreakdown as any,
          architectureNodes: result.architectureNodes as any,
          architectureEdges: result.architectureEdges as any,
          updatedAt:         new Date(),
        },
      });

      const finalId = (await tx.deploymentAnalysis.findUnique({ where: { projectId } }))!.id;

      // Replace issues
      await tx.deploymentIssue.deleteMany({ where: { analysisId: finalId } });
      if (result.issues.length > 0) {
        await tx.deploymentIssue.createMany({
          data: result.issues.map((iss) => ({
            id:         randomUUID(),
            analysisId: finalId,
            severity:   iss.severity,
            category:   iss.category,
            message:    iss.message,
            file:       iss.file ?? "",
            line:       iss.line ?? null,
            suggestion: iss.suggestion ?? "",
          })),
        });
      }

      // Replace recommendations
      await tx.deploymentRec.deleteMany({ where: { analysisId: finalId } });
      if (result.recommendations.length > 0) {
        await tx.deploymentRec.createMany({
          data: result.recommendations.map((rec) => ({
            id:          randomUUID(),
            analysisId:  finalId,
            priority:    rec.priority,
            title:       rec.title,
            description: rec.description,
            category:    rec.category,
            codeSnippet: rec.codeSnippet ?? "",
          })),
        });
      }
    });

    console.log(
      `[deploymentService] Complete for ${projectId}: ` +
      `score=${result.score}, issues=${result.issues.length}, recs=${result.recommendations.length}`
    );
  } catch (err) {
    await prisma.deploymentAnalysis.upsert({
      where:  { projectId },
      create: { id: analysisId, projectId, status: "failed" },
      update: { status: "failed", updatedAt: new Date() },
    });
    throw err;
  }
}

// ─── API query ─────────────────────────────────────────────────────────────

/**
 * getDeploymentAnalysis
 *
 * Returns the stored deployment analysis for a project.
 * Returns null if no analysis has been run yet.
 */
export async function getDeploymentAnalysis(
  projectId: string
): Promise<DeploymentAnalysisDTO | null> {
  const analysis = await prisma.deploymentAnalysis.findUnique({
    where:   { projectId },
    include: {
      issues:          { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      recommendations: { orderBy: { priority: "asc" } },
    },
  });

  if (!analysis) return null;

  return {
    projectId:         analysis.projectId,
    status:            analysis.status,
    score:             analysis.score,
    scoreBreakdown:    analysis.scoreBreakdown as any,
    filesDetected:     (analysis.filesDetected as any[]).map((f) => ({
      name:     f.name,
      path:     f.path,
      category: f.category,
    })),
    issues: analysis.issues.map((iss) => ({
      id:         iss.id,
      severity:   iss.severity,
      category:   iss.category,
      message:    iss.message,
      file:       iss.file,
      line:       iss.line ?? undefined,
      suggestion: iss.suggestion,
    })),
    recommendations: analysis.recommendations.map((rec) => ({
      id:          rec.id,
      priority:    rec.priority,
      title:       rec.title,
      description: rec.description,
      category:    rec.category,
      codeSnippet: rec.codeSnippet,
    })),
    architectureNodes: analysis.architectureNodes as any[],
    architectureEdges: analysis.architectureEdges as any[],
    updatedAt:         analysis.updatedAt.toISOString(),
  };
}

/**
 * triggerDeploymentAnalysis
 *
 * Enqueues a deployment analysis job.
 * Safe to call from the HTTP layer — returns immediately.
 */
export function triggerDeploymentAnalysis(projectId: string): void {
  // Lazy import to avoid circular deps
  import("../jobs/deploymentQueue").then(({ enqueueDeploymentJob }) => {
    enqueueDeploymentJob(projectId);
  }).catch((err) => {
    console.error("[deploymentService] Failed to enqueue job:", err);
  });
}
