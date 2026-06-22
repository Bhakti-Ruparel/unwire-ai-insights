/**
 * cloudInfrastructureTool.ts
 *
 * AI Agent tool for querying multi-cloud infrastructure.
 * Answers questions like:
 *  - "How many AWS servers do I have?"
 *  - "Which cloud resources are unhealthy?"
 *  - "Show my Docker containers"
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const cloudInfrastructureTool: AgentTool = {
  name: "cloud_infrastructure",
  description: "Queries multi-cloud infrastructure: AWS, DigitalOcean, Docker resources, statuses, and health.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const provider = input.provider as string | undefined;
      const resourceType = input.resourceType as string | undefined;
      const status = input.status as string | undefined;
      const query = (input.query as string) || "";

      // Get user's org
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: context.userId },
        select: { organizationId: true },
      });

      if (!membership) {
        return { success: true, data: { summary: "No organization found. Connect an infrastructure provider in Settings." } };
      }

      const orgId = membership.organizationId;

      // Get connections
      const connections = await prisma.infraConnection.findMany({
        where: { organizationId: orgId, status: { not: "disconnected" } },
        select: { id: true, provider: true, name: true, status: true },
      });

      if (connections.length === 0) {
        return { success: true, data: { summary: "No cloud providers connected. Go to Infrastructure settings to connect AWS, DigitalOcean, or Docker." } };
      }

      const connIds = connections.map((c) => c.id);

      // Query resources
      const where: any = { connectionId: { in: connIds } };
      if (provider) where.provider = provider;
      if (resourceType) where.resourceType = resourceType;
      if (status) where.status = status;

      // If query mentions specific keywords, filter
      const lq = query.toLowerCase();
      if (lq.includes("unhealthy") || lq.includes("down") || lq.includes("stopped") || lq.includes("error")) {
        where.status = { in: ["stopped", "terminated", "unknown"] };
      }
      if (lq.includes("aws")) where.provider = "aws";
      if (lq.includes("digitalocean") || lq.includes("droplet")) where.provider = "digitalocean";
      if (lq.includes("docker") || lq.includes("container")) where.provider = "docker";

      const resources = await prisma.cloudResource.findMany({
        where,
        select: {
          id: true, provider: true, resourceType: true, name: true,
          region: true, status: true, specs: true, metrics: true,
          connection: { select: { name: true } },
        },
        orderBy: { lastSeenAt: "desc" },
        take: 20,
      });

      // Build summary
      const total = await prisma.cloudResource.count({ where: { connectionId: { in: connIds } } });
      const running = await prisma.cloudResource.count({ where: { connectionId: { in: connIds }, status: "running" } });
      const stopped = await prisma.cloudResource.count({ where: { connectionId: { in: connIds }, status: "stopped" } });

      return {
        success: true,
        data: {
          connections: connections.map((c) => ({ provider: c.provider, name: c.name, status: c.status })),
          resources: resources.map((r) => ({
            name: r.name, provider: r.provider, type: r.resourceType,
            region: r.region, status: r.status, specs: r.specs,
            metrics: r.metrics, connectionName: r.connection.name,
          })),
          summary: {
            totalResources: total, running, stopped,
            providers: [...new Set(connections.map((c) => c.provider))],
          },
        },
        metadata: { sources: ["Multi-cloud infrastructure"] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to query cloud infrastructure." };
    }
  },
};

registerTool(cloudInfrastructureTool);
export default cloudInfrastructureTool;
