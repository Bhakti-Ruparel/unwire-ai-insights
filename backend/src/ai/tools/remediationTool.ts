/**
 * remediationTool.ts
 *
 * Executes approved remediation actions.
 * ALWAYS requires user approval before execution.
 *
 * Actions:
 *  - restart application
 *  - rollback deployment
 *  - resolve alert
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const remediationTool: AgentTool = {
  name: "remediation",
  description: "Executes remediation actions: restart application, rollback deployment, resolve alerts. Always requires approval.",
  category: "execute",
  requiresApproval: true,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const action = (input.action as string) || "";
      const serverId = input.serverId as string | undefined;
      const serverName = input.serverName as string | undefined;
      const appName = input.appName as string | undefined;
      const deploymentId = input.deploymentId as string | undefined;
      const alertId = input.alertId as string | undefined;

      // Resolve server if needed
      let resolvedServerId = serverId;
      if (!resolvedServerId && serverName) {
        const s = await prisma.server.findFirst({
          where: { userId: context.userId, name: { contains: serverName, mode: "insensitive" } },
          select: { id: true },
        });
        if (s) resolvedServerId = s.id;
      }

      switch (action) {
        case "restart_app": {
          if (!resolvedServerId || !appName) {
            return { success: false, error: "Server and application name required for restart." };
          }
          const server = await prisma.server.findFirst({
            where: { id: resolvedServerId, userId: context.userId },
            select: { id: true, name: true },
          });
          if (!server) return { success: false, error: "Server not found or access denied." };

          const { updateAppStatus, appendLogs } = await import("../../servers/serverService");
          await updateAppStatus(resolvedServerId, appName, "restarting", "restart");
          await appendLogs(resolvedServerId, [{
            appName, level: "info",
            message: `Application restart triggered by AI remediation agent`,
          }]);

          return {
            success: true,
            data: { action: "restart_app", server: server.name, app: appName,
              summary: `✅ Restart triggered for "${appName}" on ${server.name}.` },
          };
        }

        case "rollback": {
          if (!deploymentId) {
            const latest = await prisma.deployment.findFirst({
              where: { userId: context.userId, status: "FAILED" },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            });
            if (!latest) return { success: false, error: "No failed deployment found to rollback." };

            const { rollback } = await import("../../deployment/deploymentExecutionService");
            const result = await rollback(latest.id, context.userId);
            return {
              success: true,
              data: { action: "rollback", deploymentId: result.id,
                summary: `✅ Rollback initiated for the latest failed deployment.` },
            };
          }

          const { rollback } = await import("../../deployment/deploymentExecutionService");
          const result = await rollback(deploymentId, context.userId);
          return {
            success: true,
            data: { action: "rollback", deploymentId: result.id,
              summary: `✅ Rollback initiated for deployment ${deploymentId}.` },
          };
        }

        case "resolve_alert": {
          if (!alertId) return { success: false, error: "Alert ID required." };
          await prisma.alert.updateMany({
            where: { id: alertId, userId: context.userId },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
          return {
            success: true,
            data: { action: "resolve_alert", alertId, summary: `✅ Alert resolved.` },
          };
        }

        default:
          return { success: false, error: `Unknown remediation action: "${action}". Supported: restart_app, rollback, resolve_alert.` };
      }
    } catch (err: any) {
      return { success: false, error: err.message ?? "Remediation failed." };
    }
  },
};

registerTool(remediationTool);
export default remediationTool;
