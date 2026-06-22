/**
 * infrastructureHealthTool.ts
 *
 * Comprehensive infrastructure health analysis tool.
 * Gathers data from all servers, apps, alerts, and recent incidents
 * to provide a complete infrastructure overview.
 */

import { prisma } from "../../database/db";
import { getServerHealth } from "../../servers/healthService";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const infrastructureHealthTool: AgentTool = {
  name: "infrastructure_health",
  description: "Complete infrastructure analysis: all servers, applications, active alerts, health scores, and recent incidents.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      // Gather all data in parallel
      const [servers, activeAlerts, recentIncidents, recentDeployments] = await Promise.all([
        prisma.server.findMany({
          where: { userId: context.userId },
          include: {
            applications: { select: { name: true, status: true, cpu: true, memory: true } },
            metrics: { orderBy: { recordedAt: "desc" }, take: 1 },
          },
        }),
        prisma.alert.findMany({
          where: { userId: context.userId, status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.incident.findMany({
          where: { userId: context.userId, status: { in: ["OPEN", "INVESTIGATING"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.deployment.findMany({
          where: { userId: context.userId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, status: true, version: true, createdAt: true,
            project: { select: { name: true } }, server: { select: { name: true } } },
        }),
      ]);

      // Calculate health for each server
      const serverHealths = await Promise.all(
        servers.map(async (s: any) => {
          const health = await getServerHealth(s.id);
          const metric = s.metrics[0];
          return {
            id: s.id, name: s.name, host: s.host, status: s.status,
            healthScore: health.score, healthStatus: health.status,
            reasons: health.reasons,
            apps: s.applications.map((a: any) => ({
              name: a.name, status: a.status, cpu: a.cpu, memory: a.memory,
            })),
            metrics: metric ? {
              cpu: metric.cpuPercent, ram: metric.ramPercent, disk: metric.diskPercent,
            } : null,
          };
        })
      );

      const online = serverHealths.filter((s: any) => s.healthStatus !== "offline").length;
      const critical = serverHealths.filter((s: any) => s.healthStatus === "critical").length;
      const crashedApps = serverHealths.flatMap((s: any) => s.apps.filter((a: any) => a.status === "error" || a.status === "stopped"));

      return {
        success: true,
        data: {
          servers: serverHealths,
          alerts: activeAlerts.map((a: any) => ({
            id: a.id, type: a.type, severity: a.severity,
            title: a.title, message: a.message, createdAt: a.createdAt,
          })),
          incidents: recentIncidents.map((i: any) => ({
            id: i.id, title: i.title, severity: i.severity, status: i.status,
          })),
          deployments: recentDeployments.map((d: any) => ({
            version: d.version, status: d.status, project: d.project.name,
            server: d.server.name, createdAt: d.createdAt,
          })),
          summary: {
            totalServers: servers.length, online, critical,
            activeAlerts: activeAlerts.length, openIncidents: recentIncidents.length,
            crashedApps: crashedApps.length,
          },
          overallHealth: critical > 0 ? "critical" : activeAlerts.length > 0 ? "warning" : "healthy",
        },
        metadata: { sources: ["Infrastructure health analysis"] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to analyze infrastructure." };
    }
  },
};

registerTool(infrastructureHealthTool);
export default infrastructureHealthTool;
