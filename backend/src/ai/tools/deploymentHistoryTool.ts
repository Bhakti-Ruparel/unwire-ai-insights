/**
 * deploymentHistoryTool.ts
 *
 * Read-only tool: retrieves deployment history, status, and analysis.
 * Provides deployment readiness scores, recent deployments, and failure details.
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const deploymentHistoryTool: AgentTool = {
  name: "deployment_history",
  description: "Retrieves deployment history, status, logs, failure details, and deployment readiness analysis.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const deploymentId = (input.deploymentId as string) || undefined;
      const limit = Math.min((input.limit as number) || 5, 20);

      // Resolve project
      let resolvedProjectId = projectId;
      if (!resolvedProjectId && projectName) {
        const project = await prisma.project.findFirst({
          where: {
            userId: context.userId,
            name: { contains: projectName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (project) resolvedProjectId = project.id;
      }

      // If specific deployment requested
      if (deploymentId) {
        const dep = await prisma.deployment.findFirst({
          where: { id: deploymentId, userId: context.userId },
          include: {
            steps: { orderBy: { order: "asc" } },
            logs: { orderBy: { timestamp: "desc" }, take: 20 },
            project: { select: { name: true } },
            server: { select: { name: true } },
          },
        });

        if (!dep) {
          return { success: false, error: "Deployment not found or access denied." };
        }

        return {
          success: true,
          data: {
            deployment: {
              id: dep.id,
              projectName: dep.project.name,
              serverName: dep.server.name,
              version: dep.version,
              status: dep.status,
              branch: dep.branch,
              environment: dep.environment,
              error: dep.error,
              startedAt: dep.startedAt?.toISOString(),
              completedAt: dep.completedAt?.toISOString(),
              steps: dep.steps.map((s) => ({
                name: s.name,
                status: s.status,
                durationMs: s.durationMs,
                error: s.error,
              })),
              recentLogs: dep.logs.map((l) => ({
                level: l.level,
                message: l.message,
                stepName: l.stepName,
                timestamp: l.timestamp.toISOString(),
              })),
            },
            summary: `Deployment v${dep.version} to ${dep.server.name}: ${dep.status}`,
          },
          metadata: { sources: [`Deployment: ${dep.project.name} v${dep.version}`] },
        };
      }

      // List deployments for a project or all projects
      const where: any = { userId: context.userId };
      if (resolvedProjectId) where.projectId = resolvedProjectId;

      const deployments = await prisma.deployment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          project: { select: { name: true } },
          server: { select: { name: true } },
          steps: { orderBy: { order: "asc" } },
        },
      });

      if (deployments.length === 0) {
        // Try to get deployment analysis if available
        if (resolvedProjectId) {
          const analysis = await prisma.deploymentAnalysis.findUnique({
            where: { projectId: resolvedProjectId },
            include: { issues: true, recommendations: true },
          });

          if (analysis && analysis.status === "complete") {
            return {
              success: true,
              data: {
                deployments: [],
                analysis: {
                  score: analysis.score,
                  issueCount: analysis.issues.length,
                  criticalIssues: analysis.issues
                    .filter((i) => i.severity === "CRITICAL")
                    .map((i) => i.message),
                  recommendations: analysis.recommendations
                    .slice(0, 3)
                    .map((r) => ({ title: r.title, description: r.description })),
                },
                summary: `No deployments yet. Deployment readiness score: ${analysis.score}/100.`,
              },
              metadata: { sources: ["Deployment analysis"] },
            };
          }
        }

        return {
          success: true,
          data: { deployments: [], summary: "No deployments found." },
        };
      }

      // Format results
      const successCount = deployments.filter((d) => d.status === "SUCCESS").length;
      const failedCount = deployments.filter((d) => d.status === "FAILED").length;

      return {
        success: true,
        data: {
          deployments: deployments.map((d) => ({
            id: d.id,
            projectName: d.project.name,
            serverName: d.server.name,
            version: d.version,
            status: d.status,
            branch: d.branch,
            environment: d.environment,
            error: d.error,
            startedAt: d.startedAt?.toISOString(),
            completedAt: d.completedAt?.toISOString(),
            failedStep: d.steps.find((s) => s.status === "failed")?.name ?? null,
          })),
          stats: { total: deployments.length, success: successCount, failed: failedCount },
          summary: `${deployments.length} deployments: ${successCount} successful, ${failedCount} failed.`,
        },
        metadata: { sources: deployments.map((d) => `Deployment: ${d.project.name} v${d.version}`) },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to load deployment history." };
    }
  },
};

registerTool(deploymentHistoryTool);

export default deploymentHistoryTool;
