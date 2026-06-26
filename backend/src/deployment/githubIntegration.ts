/**
 * githubIntegration.ts
 *
 * GitHub integration for deployment automation.
 * Supports:
 * - OAuth app connection (for repo access)
 * - Webhook handling (push events → auto-deploy)
 * - Repository listing and selection
 */

import crypto from "crypto";
import { prisma } from "../database/db";
import { enqueue } from "../queue/deploymentQueue";
import { logger } from "../services/logger";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

// ─── OAuth ─────────────────────────────────────────────────────────────────

export function getGitHubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "repo read:user",
    state,
    redirect_uri: `${process.env.FRONTEND_URL}/settings?tab=github`,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(code: string): Promise<{ accessToken: string; username: string } | null> {
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = await res.json() as any;
    if (!data.access_token) return null;

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { "Authorization": `Bearer ${data.access_token}` },
    });
    const user = await userRes.json() as any;

    return { accessToken: data.access_token, username: user.login };
  } catch (err) {
    logger.error(`GitHub OAuth exchange failed: ${err}`);
    return null;
  }
}

// ─── Repository listing ────────────────────────────────────────────────────

export async function listRepositories(githubToken: string): Promise<Array<{
  id: number; name: string; fullName: string; private: boolean;
  defaultBranch: string; language: string | null; updatedAt: string;
}>> {
  try {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: { "Authorization": `Bearer ${githubToken}` },
    });

    if (!res.ok) return [];
    const repos = await res.json() as any[];

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      language: r.language,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}

// ─── Webhook handling ──────────────────────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export interface WebhookPushEvent {
  ref: string;
  repository: { full_name: string; clone_url: string; default_branch: string };
  head_commit: { id: string; message: string; author: { name: string } } | null;
  pusher: { name: string };
}

/**
 * Handle a GitHub push webhook.
 * Finds matching projects and triggers auto-deployment.
 */
export async function handlePushWebhook(event: WebhookPushEvent): Promise<{ triggered: number }> {
  const branch = event.ref.replace("refs/heads/", "");
  const repoUrl = event.repository.clone_url;
  const repoFullName = event.repository.full_name;

  logger.info(`[github] Push received: ${repoFullName} (${branch})`);

  // Find projects with this GitHub URL
  const projects = await prisma.project.findMany({
    where: {
      githubUrl: { contains: repoFullName },
      sourceType: "github",
    },
    select: { id: true, name: true, userId: true },
  });

  if (projects.length === 0) {
    logger.info(`[github] No matching projects for ${repoFullName}`);
    return { triggered: 0 };
  }

  let triggered = 0;

  for (const project of projects) {
    // Find the most recent successful deployment's server
    const lastDeploy = await prisma.deployment.findFirst({
      where: { projectId: project.id, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { serverId: true },
    });

    if (!lastDeploy) continue; // No previous deployment — can't auto-deploy

    // Create a new deployment
    const version = await getNextVersion(project.id);
    const deployment = await prisma.deployment.create({
      data: {
        id: crypto.randomUUID(),
        projectId: project.id,
        serverId: lastDeploy.serverId,
        userId: project.userId!,
        version,
        status: "QUEUED",
        branch,
        environment: "production",
        commitSha: event.head_commit?.id ?? "",
      },
    });

    // Enqueue
    try {
      await enqueue({
        type: "DEPLOY_PROJECT",
        data: {
          deploymentId: deployment.id,
          projectId: project.id,
          serverId: lastDeploy.serverId,
          userId: project.userId!,
          branch,
          environment: "production",
        },
      });
      triggered++;
      logger.info(`[github] Auto-deploy triggered: ${project.name} v${version}`);
    } catch (err) {
      logger.warn(`[github] Failed to enqueue deployment for ${project.name}: ${err}`);
    }
  }

  return { triggered };
}

async function getNextVersion(projectId: string): Promise<number> {
  const last = await prisma.deployment.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}
