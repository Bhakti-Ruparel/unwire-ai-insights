/**
 * serverMetricsTool.ts
 *
 * Read-only tool: fetches server metrics, health score, and status.
 * Used by the AI agent when user asks about server performance.
 */

import { prisma } from "../../database/db";
import { getMetricHistory, getServerById, getAllServers } from "../../servers/serverService";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const serverMetricsTool: AgentTool = {
  name: "server_metrics",
  description: "Reads server metrics (CPU, RAM, disk, network), health score, and status for the user's servers.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const serverId = (input.serverId as string) || undefined;
      const serverName = (input.serverName as string) || undefined;
      const range = (input.timeRange as string) || (input.range as string) || "1h";

      // Map time range to format expected by getMetricHistory
      const rangeMap: Record<string, "1m" | "1h" | "24h" | "7d"> = {
        "1m": "1m", "1h": "1h", "24h": "24h", "7d": "7d",
        "1d": "24h", "7": "7d", "24": "24h",
      };
      const normalizedRange = rangeMap[range] ?? "1h";

      // If no specific server, list all user's servers with latest metrics
      if (!serverId && !serverName) {
        const servers = await getAllServers(context.userId);
        if (servers.length === 0) {
          return {
            success: true,
            data: { servers: [], summary: "No servers connected to your account." },
          };
        }
        return {
          success: true,
          data: {
            servers: servers.map((s) => ({
              id: s.id,
              name: s.name,
              host: s.host,
              status: s.status,
              healthScore: s.healthScore,
              appCount: s.appCount,
              latestMetric: s.latestMetric,
              lastSeenAt: s.lastSeenAt,
            })),
            summary: `Found ${servers.length} server(s). ${servers.filter((s) => s.status === "online").length} online.`,
          },
          metadata: { sources: servers.map((s) => `Server: ${s.name}`) },
        };
      }

      // Find by name if no ID provided
      let resolvedServerId = serverId;
      if (!resolvedServerId && serverName) {
        const servers = await getAllServers(context.userId);
        const match = servers.find((s) =>
          s.name.toLowerCase().includes(serverName.toLowerCase())
        );
        if (match) resolvedServerId = match.id;
      }

      if (!resolvedServerId) {
        return { success: false, error: "Server not found. Try listing your servers first." };
      }

      // Specific server
      const server = await getServerById(resolvedServerId, context.userId);
      if (!server) {
        return { success: false, error: "Server not found or access denied." };
      }

      const metrics = await getMetricHistory(resolvedServerId, 30, normalizedRange);

      // Compute averages
      const avg = metrics.length > 0 ? {
        cpu: Math.round(metrics.reduce((s, m) => s + m.cpuPercent, 0) / metrics.length),
        ram: Math.round(metrics.reduce((s, m) => s + m.ramPercent, 0) / metrics.length),
        disk: Math.round(metrics.reduce((s, m) => s + m.diskPercent, 0) / metrics.length),
      } : null;

      return {
        success: true,
        data: {
          server: {
            id: server.id,
            name: server.name,
            host: server.host,
            status: server.status,
            healthScore: server.healthScore,
            provider: server.provider,
            region: server.region,
            lastSeenAt: server.lastSeenAt,
            appCount: server.appCount,
          },
          latestMetric: server.latestMetric,
          averages: avg,
          metricCount: metrics.length,
          range: normalizedRange,
        },
        metadata: { sources: [`Server: ${server.name}`] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to read server metrics." };
    }
  },
};

registerTool(serverMetricsTool);

export default serverMetricsTool;
