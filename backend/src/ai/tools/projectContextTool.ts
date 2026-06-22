/**
 * projectContextTool.ts
 *
 * Read-only tool: loads project information and analysis context.
 * Provides project metadata, APIs, dependencies, schema, and services.
 */

import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const projectContextTool: AgentTool = {
  name: "project_context",
  description: "Loads project information including APIs, dependencies, schema, tech stack, and external services.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const query = (input.query as string) || "";

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

      // If no specific project, list all user's projects
      if (!resolvedProjectId) {
        const projects = await prisma.project.findMany({
          where: {
            userId: context.userId,
            NOT: { id: { startsWith: "agent-" } },
          },
          select: {
            id: true, name: true, status: true, stack: true,
            analysisStatus: true, createdAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        });

        if (projects.length === 0) {
          return {
            success: true,
            data: { projects: [], summary: "No projects found. Upload a project to get started." },
          };
        }

        return {
          success: true,
          data: {
            projects: projects.map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              stack: p.stack,
              analysisStatus: p.analysisStatus,
              createdAt: p.createdAt.toISOString(),
            })),
            summary: `Found ${projects.length} project(s).`,
          },
          metadata: { sources: projects.map((p) => `Project: ${p.name}`) },
        };
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: resolvedProjectId, userId: context.userId },
      });
      if (!project) {
        return { success: false, error: "Project not found or access denied." };
      }

      // Load detailed context based on query
      const lq = query.toLowerCase();
      const loadAll = !query || lq.includes("overview") || lq.includes("all");

      const [apis, deps, schema, backend, services, stats] = await Promise.all([
        (loadAll || lq.includes("api") || lq.includes("endpoint") || lq.includes("route"))
          ? prisma.aPIEndpoint.findMany({ where: { projectId: resolvedProjectId }, orderBy: { method: "asc" } })
          : Promise.resolve([]),
        (loadAll || lq.includes("depend") || lq.includes("package"))
          ? prisma.dependency.findMany({ where: { projectId: resolvedProjectId }, orderBy: { name: "asc" } })
          : Promise.resolve([]),
        (loadAll || lq.includes("schema") || lq.includes("database") || lq.includes("model"))
          ? prisma.schemaTable.findMany({ where: { projectId: resolvedProjectId } })
          : Promise.resolve([]),
        (loadAll || lq.includes("backend") || lq.includes("framework"))
          ? prisma.backendInfo.findUnique({ where: { projectId: resolvedProjectId } })
          : Promise.resolve(null),
        (loadAll || lq.includes("service"))
          ? prisma.externalService.findMany({ where: { projectId: resolvedProjectId } })
          : Promise.resolve([]),
        prisma.projectStats.findUnique({ where: { projectId: resolvedProjectId } }),
      ]);

      return {
        success: true,
        data: {
          project: {
            id: project.id,
            name: project.name,
            stack: project.stack,
            status: project.status,
            analysisStatus: project.analysisStatus,
          },
          apis: apis.map((a) => ({
            method: a.method, path: a.path, file: a.file,
            authenticated: a.authenticated,
          })),
          dependencies: deps.map((d) => ({ name: d.name, version: d.version, type: d.type })),
          schema: schema.map((s) => ({ tableName: s.tableName, fields: s.fields })),
          backend: backend ? {
            framework: backend.framework,
            routes: backend.routes,
            controllers: backend.controllers,
            middleware: backend.middleware,
            requestFlow: backend.requestFlow,
          } : null,
          services: services.map((s) => ({ name: s.name, type: s.type })),
          stats: stats ? {
            files: stats.filesCount,
            apis: stats.apiCount,
            deps: stats.dependencyCount,
            schemas: stats.schemaCount,
          } : null,
          summary: `Project "${project.name}" (${project.stack.join(", ")}): ` +
            `${apis.length} APIs, ${deps.length} deps, ${schema.length} tables.`,
        },
        metadata: { sources: [`Project: ${project.name}`] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to load project context." };
    }
  },
};

registerTool(projectContextTool);

export default projectContextTool;
