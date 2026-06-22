/**
 * deploymentTool.ts
 *
 * Action tool: triggers deployments and rollbacks.
 * ALWAYS requires user approval before execution.
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const deploymentTool: AgentTool = {
  name: "deployment",
  description: "Triggers deployments, rollbacks, and service restarts. Always requires user approval.",
  category: "execute",
  requiresApproval: true,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const action = (input.action as string) || "deploy";
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const serverId = (input.serverId as string) || undefined;
      const serverName = (input.serverName as string) || undefined;
      const branch = (input.branch as string) || "main";
      const environment = (input.environment as string) || "production";
      const deploymentId = (input.deploymentId as string) || undefined;

      // Resolve project
      let resolvedProjectId = projectId;
      if (!resolvedProjectId && projectName) {
        const project = await prisma.project.findFirst({
          where: {
            userId: context.userId,
            name: { contains: projectName, mode: "insensitive" },
          },
          select: { id: true, name: true },
        });
        if (project) resolvedProjectId = project.id;
      }

      // Resolve server
      let resolvedServerId = serverId;
      if (!resolvedServerId && serverName) {
        const server = await prisma.server.findFirst({
          where: {
            userId: context.userId,
            name: { contains: serverName, mode: "insensitive" },
          },
          select: { id: true, name: true },
        });
        if (server) resolvedServerId = server.id;
      }

      switch (action) {
        case "deploy": {
          if (!resolvedProjectId || !resolvedServerId) {
            return {
              success: false,
              error: "Both a project and a server are required for deployment. " +
                "Please specify which project to deploy and to which server.",
            };
          }

          // Use the deployment execution service
          const { createDeployment } = await import("../../deployment/deploymentExecutionService");
          const deployment = await createDeployment({
            projectId: resolvedProjectId,
            serverId: resolvedServerId,
            userId: context.userId,
            branch,
            environment,
          });

          return {
            success: true,
            data: {
              deploymentId: deployment.id,
              version: deployment.version,
              status: deployment.status,
              action: "deploy",
              summary: `Deployment v${deployment.version} started. Track progress in the Deployments tab.`,
            },
            metadata: { sources: [`Deployment: v${deployment.version}`] },
          };
        }

        case "rollback": {
          if (!deploymentId) {
            // Find the latest failed deployment to rollback
            const latest = await prisma.deployment.findFirst({
              where: {
                userId: context.userId,
                ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
                status: { in: ["FAILED", "SUCCESS"] },
              },
              orderBy: { createdAt: "desc" },
              select: { id: true, version: true, status: true, project: { select: { name: true } } },
            });

            if (!latest) {
              return { success: false, error: "No deployment found to rollback." };
            }

            const { rollback } = await import("../../deployment/deploymentExecutionService");
            const rolled = await rollback(latest.id, context.userId);
            return {
              success: true,
              data: {
                deploymentId: rolled.id,
                action: "rollback",
                summary: `Rollback initiated for deployment v${latest.version} (${latest.project.name}).`,
              },
              metadata: { sources: [`Rollback: ${latest.project.name}`] },
            };
          }

          const { rollback } = await import("../../deployment/deploymentExecutionService");
          const rolled = await rollback(deploymentId, context.userId);
          return {
            success: true,
            data: {
              deploymentId: rolled.id,
              action: "rollback",
              summary: `Rollback initiated for deployment ${deploymentId}.`,
            },
            metadata: { sources: [`Rollback: ${deploymentId}`] },
          };
        }

        case "restart": {
          if (!resolvedServerId) {
            return { success: false, error: "A server is required for restart. Please specify which server." };
          }

          const appName = (input.appName as string) || "";
          if (!appName) {
            return { success: false, error: "An application name is required for restart." };
          }

          // Verify server ownership
          const server = await prisma.server.findFirst({
            where: { id: resolvedServerId, userId: context.userId },
            select: { id: true, name: true },
          });
          if (!server) {
            return { success: false, error: "Server not found or access denied." };
          }

          // Update app status
          const { updateAppStatus, appendLogs } = await import("../../servers/serverService");
          await updateAppStatus(resolvedServerId, appName, "restarting", "restart");
          await appendLogs(resolvedServerId, [{
            appName,
            level: "info",
            message: `Application restart triggered by AI Agent`,
          }]);

          return {
            success: true,
            data: {
              serverId: resolvedServerId,
              serverName: server.name,
              appName,
              action: "restart",
              summary: `Restart triggered for "${appName}" on ${server.name}.`,
            },
            metadata: { sources: [`Server: ${server.name}`] },
          };
        }

        default:
          return {
            success: false,
            error: `Unsupported action: "${action}". Supported: deploy, rollback, restart.`,
          };
      }
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to execute deployment action." };
    }
  },
};

registerTool(deploymentTool);

export default deploymentTool;
