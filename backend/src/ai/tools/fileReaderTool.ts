/**
 * fileReaderTool.ts
 *
 * Read-only tool: reads specific project files from disk.
 * Used when the agent needs to inspect a particular file.
 * Respects project ownership and path traversal protections.
 */

import path from "path";
import fs from "fs";
import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

// Max file size to read (100KB)
const MAX_FILE_SIZE = 100 * 1024;

const fileReaderTool: AgentTool = {
  name: "file_reader",
  description: "Reads specific files from an analyzed project. Supports reading source code, configs, and documentation files.",
  category: "read",
  requiresApproval: false,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const filePath = (input.filePath as string) || (input.file as string) || "";

      if (!filePath) {
        return { success: false, error: "A file path is required." };
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

      // If no project specified, use most recent
      if (!resolvedProjectId) {
        const recentProject = await prisma.project.findFirst({
          where: {
            userId: context.userId,
            NOT: { id: { startsWith: "agent-" } },
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        if (recentProject) resolvedProjectId = recentProject.id;
      }

      if (!resolvedProjectId) {
        return { success: false, error: "No project found. Please specify a project." };
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: resolvedProjectId, userId: context.userId },
        select: { id: true, name: true },
      });
      if (!project) {
        return { success: false, error: "Project not found or access denied." };
      }

      // Build the full path safely (prevent path traversal)
      const projectDir = path.join(process.cwd(), "uploads", resolvedProjectId, "source");
      const resolvedPath = path.resolve(projectDir, filePath);

      // Security: ensure the resolved path is within the project directory
      if (!resolvedPath.startsWith(projectDir)) {
        return { success: false, error: "Access denied: path traversal detected." };
      }

      // Check file exists
      if (!fs.existsSync(resolvedPath)) {
        // Try to find the file with a broader search
        const altPath = findFile(projectDir, path.basename(filePath));
        if (!altPath) {
          return {
            success: false,
            error: `File "${filePath}" not found in project "${project.name}".`,
          };
        }
        return readFileContent(altPath, projectDir, project.name);
      }

      return readFileContent(resolvedPath, projectDir, project.name);
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to read file." };
    }
  },
};

function readFileContent(absolutePath: string, projectDir: string, projectName: string): ToolResult {
  const stat = fs.statSync(absolutePath);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
    const listing = entries.slice(0, 50).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
    }));
    return {
      success: true,
      data: {
        type: "directory",
        path: path.relative(projectDir, absolutePath),
        entries: listing,
        summary: `Directory with ${entries.length} entries.`,
      },
      metadata: { sources: [`Project: ${projectName}`] },
    };
  }

  if (stat.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File is too large (${(stat.size / 1024).toFixed(0)}KB). Max: ${MAX_FILE_SIZE / 1024}KB.`,
    };
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const relativePath = path.relative(projectDir, absolutePath);
  const extension = path.extname(absolutePath).slice(1);
  const lineCount = content.split("\n").length;

  return {
    success: true,
    data: {
      type: "file",
      path: relativePath,
      extension,
      lineCount,
      content: content.slice(0, 5000), // Cap at 5KB for agent context
      truncated: content.length > 5000,
      summary: `File "${relativePath}" (${lineCount} lines, ${extension}).`,
    },
    metadata: { sources: [`${relativePath}`] },
  };
}

function findFile(baseDir: string, filename: string): string | null {
  if (!fs.existsSync(baseDir)) return null;

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name === filename) {
        const parent = (entry as any).parentPath || (entry as any).path || baseDir;
        return path.join(parent, entry.name);
      }
    }
  } catch {
    // Ignore errors during recursive search
  }
  return null;
}

registerTool(fileReaderTool);

export default fileReaderTool;
