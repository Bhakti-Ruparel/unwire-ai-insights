/**
 * incidentAnalysisTool.ts
 *
 * AI incident analysis tool.
 * Analyzes failures by correlating metrics, logs, and deployments
 * to find root cause and suggest remediation.
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const incidentAnalysisTool: AgentTool = {
  name: "incident_analysis",
  description: "Deep-dive analysis of an incident or alert. Correlates metrics, logs, and deployments to find root cause.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const alertId = input.alertId as string | undefined;
      const serverId = input.serverId as string | undefined;
      const serverName = input.serverName as string | undefined;

      // Resolve server
      let resolvedServerId = serverId;
      if (!resolvedServerId && serverName) {
        const s = await prisma.server.findFirst({
          where: { userId: context.userId, name: { contains: serverName, mode: "insensitive" } },
          select: { id: true },
        });
        if (s) resolvedServerId = s.id;
      }

      // If alert specified, get server from alert
      if (alertId) {
        const alert = await prisma.alert.findFirst({
          where: { id: alertId, userId: context.userId },
        });
        if (alert?.serverId) resolvedServerId = alert.serverId;
      }

      if (!resolvedServerId) {
        // Get the first server with issues
        const problemServer = await prisma.server.findFirst({
          where: { userId: context.userId, status: { not: "online" } },
          select: { id: true },
        });
        if (!problemServer) {
          // Use the most recent alert's server
          const recentAlert = await prisma.alert.findFirst({
            where: { userId: context.userId, status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
          });
          resolvedServerId = recentAlert?.serverId ?? undefined;
        } else {
          resolvedServerId = problemServer.id;
        }
      }

      if (!resolvedServerId) {
        return { success: true, data: { summary: "No server issues detected. All systems appear healthy." } };
      }

      // Gather deep context for this server
      const [server, metrics, errors, warns, apps, deployments, alerts] = await Promise.all([
        prisma.server.findFirst({ where: { id: resolvedServerId, userId: context.userId } }),
        prisma.serverMetric.findMany({
          where: { serverId: resolvedServerId },
          orderBy: { recordedAt: "desc" }, take: 10,
        }),
        prisma.serverLog.findMany({
          where: { serverId: resolvedServerId, level: "error", timestamp: { gte: new Date(Date.now() - 30 * 60_000) } },
          orderBy: { timestamp: "desc" }, take: 20,
        }),
        prisma.serverLog.findMany({
          where: { serverId: resolvedServerId, level: "warn", timestamp: { gte: new Date(Date.now() - 30 * 60_000) } },
          orderBy: { timestamp: "desc" }, take: 10,
        }),
        prisma.serverApp.findMany({ where: { serverId: resolvedServerId } }),
        prisma.deployment.findMany({
          where: { serverId: resolvedServerId },
          orderBy: { createdAt: "desc" }, take: 3,
          include: { project: { select: { name: true } } },
        }),
        prisma.alert.findMany({
          where: { serverId: resolvedServerId, userId: context.userId, status: "ACTIVE" },
          orderBy: { createdAt: "desc" }, take: 5,
        }),
      ]);

      if (!server) return { success: false, error: "Server not found or access denied." };

      // Build analysis
      const latestMetric = metrics[0];
      const crashedApps = apps.filter((a: any) => a.status === "error" || a.status === "stopped");
      const recentFailedDeploy = deployments.find((d: any) => d.status === "FAILED");

      // Determine root cause
      let rootCause = "Unable to determine root cause — insufficient data.";
      let confidence = 0.3;

      if (crashedApps.length > 0 && recentFailedDeploy) {
        rootCause = `Application "${crashedApps[0].name}" crashed after deployment v${recentFailedDeploy.version} of "${recentFailedDeploy.project.name}". The deployment likely introduced a breaking change.`;
        confidence = 0.85;
      } else if (latestMetric && latestMetric.ramPercent > 90 && errors.some((e: any) => e.message.toLowerCase().includes("memory"))) {
        rootCause = `Server is running out of memory (${latestMetric.ramPercent.toFixed(0)}%). Applications are being OOM-killed.`;
        confidence = 0.9;
      } else if (latestMetric && latestMetric.cpuPercent > 90) {
        rootCause = `Server CPU is saturated at ${latestMetric.cpuPercent.toFixed(0)}%. Requests are likely timing out.`;
        confidence = 0.8;
      } else if (errors.length > 5) {
        const patterns = errors.map((e: any) => e.message.slice(0, 50));
        rootCause = `Error spike detected (${errors.length} errors in 30 min). Dominant pattern: "${patterns[0]}"`;
        confidence = 0.7;
      } else if (crashedApps.length > 0) {
        rootCause = `Application "${crashedApps[0].name}" is in "${crashedApps[0].status}" state.`;
        confidence = 0.6;
      }

      return {
        success: true,
        data: {
          server: { id: server.id, name: server.name, status: server.status },
          rootCause,
          confidence,
          metrics: latestMetric ? {
            cpu: latestMetric.cpuPercent, ram: latestMetric.ramPercent, disk: latestMetric.diskPercent,
          } : null,
          errors: errors.slice(0, 5).map((e: any) => ({ app: e.appName, message: e.message, time: e.timestamp })),
          crashedApps: crashedApps.map((a: any) => ({ name: a.name, status: a.status })),
          recentDeploy: recentFailedDeploy ? {
            version: recentFailedDeploy.version, status: recentFailedDeploy.status,
            project: recentFailedDeploy.project.name,
          } : null,
          activeAlerts: alerts.map((a: any) => ({ type: a.type, severity: a.severity, title: a.title })),
          recommendation: buildRemediation(rootCause, crashedApps, recentFailedDeploy, latestMetric),
        },
        metadata: { sources: [`Incident analysis: ${server.name}`] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to analyze incident." };
    }
  },
};

function buildRemediation(rootCause: string, crashedApps: any[], failedDeploy: any, metric: any): string {
  if (failedDeploy && crashedApps.length > 0) {
    return `Rollback deployment v${failedDeploy.version} to restore the previous working state.`;
  }
  if (metric?.ramPercent > 90) {
    return "Restart the highest-memory application, then investigate the memory leak source.";
  }
  if (metric?.cpuPercent > 90) {
    return "Identify the CPU-intensive process and consider scaling or optimizing the workload.";
  }
  if (crashedApps.length > 0) {
    return `Restart "${crashedApps[0].name}" and monitor logs for recurring crashes.`;
  }
  return "Monitor the situation. If issues persist, check application logs for more context.";
}

registerTool(incidentAnalysisTool);
export default incidentAnalysisTool;
