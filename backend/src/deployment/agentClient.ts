/**
 * agentClient.ts
 *
 * HTTP client for communicating with the Unwire AI server agent.
 * The agent runs a command server on port 9898 that accepts deployment actions.
 *
 * Endpoint resolution:
 *   1. Uses server.host (set by user or agent registration)
 *   2. Falls back to lastHeartbeat IP if host is unreachable
 *   3. Tries localhost for local development
 *
 * Security:
 * - All requests authenticated with the server's agentToken
 * - Agent only accepts whitelisted commands
 * - Timeout enforcement on all operations
 */

import { prisma } from "../database/db";
import { logger } from "../services/logger";

const AGENT_PORT = 9898;

export interface AgentDeployRequest {
  deploymentId: string;
  action: "clone" | "write_files" | "build" | "deploy" | "healthcheck" | "stop" | "rollback" | "exec";
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
 * Resolve the agent's reachable endpoint.
 * For local Docker development: uses localhost directly.
 * For production: tries server.host and heartbeat IP.
 */
async function resolveAgentEndpoint(serverId: string): Promise<{ url: string; token: string; name: string }> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { host: true, agentToken: true, name: true },
  });
  if (!server) throw new Error(`Server ${serverId} not found`);

  // Get last known heartbeat IP
  const lastHeartbeat = await prisma.serverHeartbeat.findFirst({
    where: { serverId },
    orderBy: { timestamp: "desc" },
    select: { ip: true },
  });

  // Build ordered candidate list
  const candidates: string[] = [];

  // For Docker local dev: localhost is the most likely to work (port is exposed)
  if (server.host === "host.docker.internal" || server.host === "localhost" || server.host === "127.0.0.1") {
    candidates.push("127.0.0.1");
  } else if (server.host) {
    candidates.push(server.host);
  }

  // Always try localhost as primary fallback for dev
  if (!candidates.includes("127.0.0.1")) candidates.push("127.0.0.1");

  // Heartbeat IP (cleaned)
  if (lastHeartbeat?.ip) {
    const cleanIp = lastHeartbeat.ip.replace("::ffff:", "").replace("::1", "127.0.0.1");
    if (cleanIp && !candidates.includes(cleanIp)) candidates.push(cleanIp);
  }

  // Quick probe each candidate (1.5s timeout per candidate)
  for (const host of candidates) {
    const url = `http://${host}:${AGENT_PORT}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        return { url, token: server.agentToken, name: server.name };
      }
    } catch { /* next candidate */ }
  }

  // None responded — return first candidate (will fail with descriptive error)
  const fallback = `http://${candidates[0] ?? "127.0.0.1"}:${AGENT_PORT}`;
  return { url: fallback, token: server.agentToken, name: server.name };
}

/**
 * Send a deployment command to the server's agent.
 */
export async function sendAgentCommand(
  serverId: string,
  request: AgentDeployRequest
): Promise<AgentCommandResult> {
  const { url: agentBaseUrl, token, name } = await resolveAgentEndpoint(serverId);
  const agentUrl = `${agentBaseUrl}/deploy`;
  const timeoutMs = (request.timeout ?? 600) * 1000;

  logger.info(`[agentClient] Sending ${request.action} to ${name} at ${agentUrl}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
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
      return { exitCode: -1, stdout: "", stderr: "", durationMs: timeoutMs, error: `Agent command timed out after ${timeoutMs / 1000}s` };
    }
    return { exitCode: -1, stdout: "", stderr: "", durationMs: 0, error: `Agent unreachable at ${agentUrl}: ${err.message}` };
  }
}

/**
 * Check if the agent on a server is reachable and ready.
 * Returns detailed health info.
 */
export async function checkAgentReady(serverId: string): Promise<boolean> {
  try {
    const { url } = await resolveAgentEndpoint(serverId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get detailed agent health status.
 */
export async function getAgentHealth(serverId: string): Promise<{
  connected: boolean;
  latencyMs: number;
  endpoint: string;
  agentVersion?: string;
  lastHeartbeat?: string;
}> {
  const start = Date.now();

  try {
    const { url } = await resolveAgentEndpoint(serverId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (response.ok) {
      const data = await response.json() as any;
      return { connected: true, latencyMs, endpoint: url, agentVersion: data?.version };
    }
    return { connected: false, latencyMs, endpoint: url };
  } catch {
    return { connected: false, latencyMs: Date.now() - start, endpoint: "unreachable" };
  }
}
