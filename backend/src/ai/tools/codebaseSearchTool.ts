/**
 * codebaseSearchTool.ts
 *
 * Read-only tool: searches project codebase using RAG (vector search).
 * Falls back to structured context when RAG is not available.
 */

import { prisma } from "../../database/db";
import { searchProjectVectors } from "../vectorStore";
import { isEmbeddingAvailable } from "../embeddings";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const codebaseSearchTool: AgentTool = {
  name: "codebase_search",
  description: "Searches the project codebase using semantic vector search. Finds relevant code, functions, and patterns.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const query = (input.query as string) || "";
      const topK = Math.min((input.topK as number) || 5, 10);

      if (!query) {
        return { success: false, error: "A search query is required." };
      }

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

      // If no specific project, use the most recently updated one
      if (!resolvedProjectId) {
        const recentProject = await prisma.project.findFirst({
          where: {
            userId: context.userId,
            NOT: { id: { startsWith: "agent-" } },
            analysisStatus: "complete",
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true },
        });

        if (!recentProject) {
          return {
            success: true,
            data: { results: [], summary: "No analyzed projects available for code search." },
          };
        }
        resolvedProjectId = recentProject.id;
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: resolvedProjectId, userId: context.userId },
        select: { id: true, name: true, embeddingStatus: true },
      });
      if (!project) {
        return { success: false, error: "Project not found or access denied." };
      }

      // Try RAG search
      if (isEmbeddingAvailable() && project.embeddingStatus === "complete") {
        try {
          const results = await searchProjectVectors(resolvedProjectId, query, topK);

          if (results.length > 0) {
            const codeResults = results.map((doc) => {
              const meta = doc.metadata as {
                file: string;
                startLine: number;
                endLine: number;
              };
              return {
                file: meta.file,
                lines: `${meta.startLine}–${meta.endLine}`,
                content: doc.pageContent.slice(0, 500),
                relevance: "high",
              };
            });

            return {
              success: true,
              data: {
                projectName: project.name,
                results: codeResults,
                count: codeResults.length,
                summary: `Found ${codeResults.length} relevant code sections in "${project.name}".`,
              },
              metadata: {
                sources: codeResults.map((r) => `${r.file} (lines ${r.lines})`),
              },
            };
          }
        } catch (err) {
          console.warn("[codebaseSearchTool] Vector search failed:", err);
        }
      }

      // Fallback: search API endpoints and file structure
      const apis = await prisma.aPIEndpoint.findMany({
        where: {
          projectId: resolvedProjectId,
          OR: [
            { path: { contains: query, mode: "insensitive" } },
            { file: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 10,
      });

      return {
        success: true,
        data: {
          projectName: project.name,
          results: apis.map((a) => ({
            file: a.file,
            type: "api_endpoint",
            content: `${a.method} ${a.path}`,
            relevance: "medium",
          })),
          count: apis.length,
          ragAvailable: false,
          summary: apis.length > 0
            ? `Found ${apis.length} matching API endpoints in "${project.name}". Full code search requires embeddings.`
            : `No direct matches found. Embeddings status: ${project.embeddingStatus}.`,
        },
        metadata: { sources: [`Project: ${project.name}`] },
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to search codebase." };
    }
  },
};

registerTool(codebaseSearchTool);

export default codebaseSearchTool;
