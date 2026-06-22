/**
 * logsSearchTool.ts
 *
 * Read-only tool: searches server logs by level, app name, time range, keywords.
 * Used by the AI agent for log analysis and error investigation.
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const logsSearchTool: AgentTool = {
  name: "logs_search",
  description: "Searches and analyzes server logs. Filters by level (error, warn, info), app name, time range, and keywords.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const serverId = (input.serverId as string) || undefined;
      const serverName = (input.serverName as string) || undefined;
      const level = (input.level as string) || undefined;
      const appName = (input.appName as string) || undefined;
      const query = (input.query as string) || "";
      const limit = Math.min((input.limit as number) || 50, 100);

      // Resolve server
      let resolvedServerId = serverId;
      if (!resolvedServerId) {
        if (serverName) {
          const server = await prisma.server.findFirst({
            where: {
              userId: context.userId,
              name: { contains: serverName, mode: "insensitive" },
            },
            select: { id: true, name: true },
          });
          if (server) resolvedServerId = server.id;
        }

        // If still no server, search across all user's servers
        if (!resolvedServerId) {
          const servers = await prisma.server.findMany({
            where: { userId: context.userId },
            select: { id: true },
          });
          if (servers.length === 0) {
            return { success: true, data: { logs: [], summary: "No servers connected." } };
          }

          // Search across all servers
          const where: any = {
            serverId: { in: servers.map((s) => s.id) },
          };
          if (level) where.level = level.toLowerCase();
          if (appName) where.appName = { contains: appName, mode: "insensitive" };
          if (query) where.message = { contains: query, mode: "insensitive" };

          const logs = await prisma.serverLog.findMany({
            where,
            orderBy: { timestamp: "desc" },
            take: limit,
            include: { server: { select: { name: true } } },
          });

          return {
            success: true,
            data: {
              logs: logs.map((l) => ({
                serverName: (l as any).server.name,
                appName: l.appName,
                level: l.level,
                message: l.message,
                timestamp: l.timestamp.toISOString(),
              })),
              count: logs.length,
              summary: logs.length > 0
                ? `Found ${logs.length} log entries across all servers.`
                : "No logs matching your criteria.",
            },
            metadata: { sources: ["Server logs"] },
          };
        }
      }

      // Verify ownership
      const server = await prisma.server.findFirst({
        where: { id: resolvedServerId, userId: context.userId },
        select: { id: true, name: true },
      });
      if (!server) {
        return { success: false, error: "Server not found or access denied." };
      }

      // Build query
      const where: any = { serverId: resolvedServerId };
      if (level) where.level = level.toLowerCase();
      if (appName) where.appName = { contains: appName, mode: "insensitive" };
      if (query) where.message = { contains: query, mode: "insensitive" };

      const logs = await prisma.serverLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      // Summary stats
      const errorCount = logs.filter((l) => l.level === "error").length;
      const warnCount = logs.filter((l) => l.level === "warn").length;

      return {
        success: true,
        data: {
          serverName: server.name,
          logs: logs.map((l) => ({
            appName: l.appName,
            level: l.level,
            message: l.message,
            timestamp: l.timestamp.toISOString(),
          })),
          count: logs.length,
          errorCount,
          warnCount,
          summary: logs.length > 0
            ? `Found ${logs.length} logs on ${server.name}. ${errorCount} errors, ${warnCount} warnings.`
            : `No logs matching your criteria on ${server.name}.`,
        },
        metadata: { sources: [`Server: ${server.name} logs`] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to search logs." };
    }
  },
};

registerTool(logsSearchTool);

export default logsSearchTool;
