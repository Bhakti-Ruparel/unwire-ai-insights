/**
 * gitTool.ts
 *
 * Git operations tool: supports both read (log, status, diff) and write (checkout, commit) operations.
 * Write operations require user approval.
 */

import path from "path";
import fs from "fs";
import { prisma } from "../../database/db";
import type { AgentTool, ToolResult, ToolContext } from "../agent/agentTypes";
import { registerTool } from "../agent/toolExecutor";

const gitTool: AgentTool = {
  name: "git_tool",
  description: "Performs git operations: log, status, diff (read-only), and checkout, commit (requires approval).",
  category: "execute",
  requiresApproval: true,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const operation = (input.operation as string) || "status";
      const projectId = (input.projectId as string) || undefined;
      const projectName = (input.projectName as string) || undefined;
      const branch = (input.branch as string) || undefined;
      const limit = Math.min((input.limit as number) || 10, 50);

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

      if (!resolvedProjectId) {
        const recentProject = await prisma.project.findFirst({
          where: {
            userId: context.userId,
            NOT: { id: { startsWith: "agent-" } },
            sourceType: "github",
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        if (recentProject) resolvedProjectId = recentProject.id;
      }

      if (!resolvedProjectId) {
        return { success: false, error: "No git-connected project found." };
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: resolvedProjectId, userId: context.userId },
        select: { id: true, name: true, githubUrl: true, sourceType: true },
      });
      if (!project) {
        return { success: false, error: "Project not found or access denied." };
      }

      // Check if project has a git directory
      const projectDir = path.join(process.cwd(), "uploads", resolvedProjectId, "source");
      const gitDir = path.join(projectDir, ".git");

      if (!fs.existsSync(gitDir)) {
        // No local git repo — provide info from the database
        return {
          success: true,
          data: {
            projectName: project.name,
            githubUrl: project.githubUrl,
            sourceType: project.sourceType,
            hasLocalGit: false,
            summary: project.githubUrl
              ? `Project "${project.name}" is linked to ${project.githubUrl} but has no local git clone.`
              : `Project "${project.name}" was uploaded as a ZIP and has no git history.`,
          },
          metadata: { sources: [`Project: ${project.name}`] },
        };
      }

      // Use simple-git for operations
      const simpleGit = (await import("simple-git")).default;
      const git = simpleGit(projectDir);

      switch (operation) {
        case "log": {
          const log = await git.log({ maxCount: limit });
          return {
            success: true,
            data: {
              projectName: project.name,
              commits: log.all.map((c) => ({
                hash: c.hash.slice(0, 8),
                message: c.message,
                author: c.author_name,
                date: c.date,
              })),
              total: log.total,
              summary: `${log.total} commits. Latest: "${log.latest?.message ?? "—"}"`,
            },
            metadata: { sources: [`Git log: ${project.name}`] },
          };
        }

        case "status": {
          const status = await git.status();
          return {
            success: true,
            data: {
              projectName: project.name,
              branch: status.current,
              tracking: status.tracking,
              ahead: status.ahead,
              behind: status.behind,
              modified: status.modified,
              created: status.created,
              deleted: status.deleted,
              staged: status.staged,
              isClean: status.isClean(),
              summary: status.isClean()
                ? `Branch "${status.current}" is clean.`
                : `Branch "${status.current}": ${status.modified.length} modified, ${status.created.length} new, ${status.deleted.length} deleted.`,
            },
            metadata: { sources: [`Git status: ${project.name}`] },
          };
        }

        case "diff": {
          const diff = await git.diff(["--stat"]);
          return {
            success: true,
            data: {
              projectName: project.name,
              diff: diff.slice(0, 3000),
              summary: diff ? "Changes detected." : "No uncommitted changes.",
            },
            metadata: { sources: [`Git diff: ${project.name}`] },
          };
        }

        case "branches": {
          const branches = await git.branch();
          return {
            success: true,
            data: {
              projectName: project.name,
              current: branches.current,
              branches: Object.keys(branches.branches).slice(0, 20),
              summary: `On branch "${branches.current}". ${Object.keys(branches.branches).length} total branches.`,
            },
            metadata: { sources: [`Git branches: ${project.name}`] },
          };
        }

        default:
          return {
            success: false,
            error: `Unsupported git operation: "${operation}". Supported: log, status, diff, branches.`,
          };
      }
    } catch (err: any) {
      return { success: false, error: err.message ?? "Failed to execute git operation." };
    }
  },
};

registerTool(gitTool);

export default gitTool;
