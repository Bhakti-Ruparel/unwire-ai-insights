/**
 * agentClient.ts
 *
 * HTTP client for communicating with the Unwire AI server agent.
 * The agent runs a command server on port 9898 that accepts deployment actions.
 *
 * Flow: Backend → Agent HTTP API → Agent executes commands → Returns result
 *
 * Security:
 * - All requests authenticated with the server's agentToken
 * - Agent only accepts whitelisted commands
 * - Timeout enforcement on all operations
 */

import { prisma } from "../database/db";
import { logger } from "../services/logger";

const AGENT_PORT = 9898;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

export interface AgentDeployRequest {
  deploymentId: string;
  action: "clone" | "write_files" | "build" | "deploy" | "healthcheck" | "stop" | "rollback";
  repository?: string;
  branch?: string;
  workDir?: string;
  files?: Record<string, string>;
  envVars?: Record<string, string>;
  port?: number;
  appName?: string;
  timeout?: number;
}

export interface AgentCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

/**
 * Send a deployment command to the server's agent.
 * Resolves the server's IP and agent token from the database.
 */
export async function sendAgentCommand(
  serverId: string,
  request: AgentDeployRequest
): Promise<AgentCommandResult> {
  // Look up server details
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { host: true, agentToken: true, name: true },
  });

  if (!server) {
    throw new Error(`Server ${serverId} not found`);
  }

  const agentUrl = `http://${server.host}:${AGENT_PORT}/deploy`;
  const timeoutMs = (request.timeout ?? 600) * 1000;

  logger.info(`[agentClient] Sending ${request.action} to ${server.name} (${server.host})`, {
    path: agentUrl,
    method: "POST",
  } as any);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${server.agentToken}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const result: AgentCommandResult = await response.json() as AgentCommandResult;

    if (!response.ok && !result.exitCode) {
      result.exitCode = response.status;
      result.error = result.error ?? `Agent returned HTTP ${response.status}`;
    }

    return result;
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "",
        durationMs: timeoutMs,
        error: `Agent command timed out after ${timeoutMs / 1000}s`,
      };
    }

    return {
      exitCode: -1,
      stdout: "",
      stderr: "",
      durationMs: 0,
      error: `Agent unreachable: ${err.message}. Is the agent running on ${server.host}?`,
    };
  }
}

/**
 * Check if the agent on a server is reachable and ready.
 */
export async function checkAgentReady(serverId: string): Promise<boolean> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { host: true, agentToken: true },
  });

  if (!server) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${server.host}:${AGENT_PORT}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
