/**
 * commandService.ts
 *
 * Executes registered commands on servers via the agent.
 * Tracks execution history in database.
 * Enforces: one active command per server, timeouts, RBAC.
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";
import { sendAgentCommand } from "../deployment/agentClient";
import { getCommandById, resolveCommandString } from "./commandRegistry";
import { broadcastServerEvent } from "../servers/serverSSE";
import { recordAudit } from "../billing/auditService";
import { logger } from "../services/logger";

const MAX_TIMEOUT_S = 300; // 5 minutes max
const activeExecutions = new Set<string>(); // serverId set for concurrency control

export interface CommandExecution {
  id: string;
  serverId: string;
  commandId: string;
  commandName: string;
  command: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ─── Execute a command ────────────────────────────────────────────────────

export async function executeCommand(opts: {
  serverId: string;
  commandId: string;
  params?: Record<string, string>;
  userId: string;
  organizationId?: string;
}): Promise<CommandExecution> {
  const cmdDef = getCommandById(opts.commandId);
  if (!cmdDef) throw new Error(`Command "${opts.commandId}" not found in registry.`);

  // Resolve parameterized command
  const resolvedCmd = resolveCommandString(opts.commandId, opts.params ?? {});
  if (!resolvedCmd) throw new Error("Missing required parameters.");

  // Concurrency check — one active command per server
  if (activeExecutions.has(opts.serverId)) {
    throw new Error("Another command is already running on this server. Wait for it to complete.");
  }

  // Create execution record
  const execId = randomUUID();
  await prisma.usageRecord.create({
    data: {
      id: execId,
      userId: opts.userId,
      type: "command_execution",
      metadata: {
        serverId: opts.serverId,
        commandId: opts.commandId,
        commandName: cmdDef.name,
        command: resolvedCmd,
        status: "running",
        stdout: "",
        stderr: "",
        exitCode: null,
        durationMs: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      } as any,
    },
  });

  // Mark server as busy
  activeExecutions.add(opts.serverId);

  // Broadcast start
  broadcastServerEvent(opts.serverId, "app", {
    type: "command_execution",
    executionId: execId,
    commandId: opts.commandId,
    status: "running",
    command: resolvedCmd,
  });

  // Execute async
  runCommand(execId, opts.serverId, opts.commandId, cmdDef.name, resolvedCmd, opts.userId, opts.organizationId)
    .finally(() => activeExecutions.delete(opts.serverId));

  recordAudit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "command.executed",
    resource: `server:${opts.serverId}`,
    metadata: { commandId: opts.commandId, command: resolvedCmd },
  });

  return {
    id: execId,
    serverId: opts.serverId,
    commandId: opts.commandId,
    commandName: cmdDef.name,
    command: resolvedCmd,
    status: "running",
    stdout: "",
    stderr: "",
    exitCode: null,
    durationMs: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Actual execution ─────────────────────────────────────────────────────

async function runCommand(
  execId: string, serverId: string, commandId: string,
  commandName: string, command: string, userId: string, organizationId?: string
): Promise<void> {
  const start = Date.now();

  try {
    const result = await sendAgentCommand(serverId, {
      deploymentId: execId,
      action: "exec",
      repository: command,
      appName: "command-center",
      timeout: MAX_TIMEOUT_S,
    });

    const durationMs = Date.now() - start;
    const status = result.exitCode === 0 ? "success" : "failed";

    await prisma.usageRecord.update({
      where: { id: execId },
      data: {
        metadata: {
          serverId, commandId, commandName, command, status,
          stdout: (result.stdout ?? "").slice(0, 50000),
          stderr: (result.stderr ?? "").slice(0, 10000),
          exitCode: result.exitCode,
          durationMs,
          startedAt: new Date(start).toISOString(),
          completedAt: new Date().toISOString(),
        } as any,
      },
    });

    broadcastServerEvent(serverId, "app", {
      type: "command_execution",
      executionId: execId,
      commandId,
      status,
      exitCode: result.exitCode,
      stdout: (result.stdout ?? "").slice(0, 5000),
      durationMs,
    });

  } catch (err: any) {
    await prisma.usageRecord.update({
      where: { id: execId },
      data: {
        metadata: {
          serverId, commandId, commandName, command,
          status: "failed",
          stdout: "",
          stderr: err.message ?? "Execution failed",
          exitCode: -1,
          durationMs: Date.now() - start,
          startedAt: new Date(start).toISOString(),
          completedAt: new Date().toISOString(),
        } as any,
      },
    });

    broadcastServerEvent(serverId, "app", {
      type: "command_execution",
      executionId: execId,
      commandId,
      status: "failed",
      error: err.message,
    });
  }
}

// ─── Get available commands for a server (dynamic) ────────────────────────

export async function getAvailableCommands(serverId: string): Promise<Array<{
  id: string; name: string; description: string; category: string;
  riskLevel: string; requiresConfirmation: boolean; icon?: string;
  params?: any[]; available: boolean;
}>> {
  const { COMMAND_REGISTRY } = await import("./commandRegistry");

  // Get detected apps/processes from the server
  const apps = await prisma.serverApp.findMany({
    where: { serverId },
    select: { name: true, type: true, status: true },
  });

  // Get installed software
  const installs = await prisma.usageRecord.findMany({
    where: { type: "software_installation", metadata: { path: ["serverId"], equals: serverId } },
  });

  // Build a set of what's on the server
  const detected = new Set<string>();
  for (const app of apps) {
    const n = app.name.toLowerCase();
    if (n.includes("docker") || app.type === "docker") detected.add("docker");
    if (n.includes("nginx")) detected.add("nginx");
    if (n.includes("postgres") || n.includes("psql")) detected.add("database");
    if (n.includes("redis")) detected.add("redis");
    if (n.includes("node") || n.includes("npm")) detected.add("node");
    if (n.includes("pm2")) detected.add("pm2");
    if (n.includes("python")) detected.add("python");
    if (n.includes("git")) detected.add("git");
    if (n.includes("mongo")) detected.add("database");
  }

  for (const r of installs) {
    const meta = r.metadata as any;
    if (meta?.status === "installed") {
      const sw = (meta.softwareId ?? "").toLowerCase();
      if (sw.includes("docker")) detected.add("docker");
      if (sw.includes("nginx")) detected.add("nginx");
      if (sw.includes("postgres") || sw.includes("mysql") || sw.includes("mongo")) detected.add("database");
      if (sw.includes("redis")) detected.add("redis");
      if (sw.includes("node")) detected.add("node");
      if (sw.includes("pm2")) detected.add("pm2");
      if (sw.includes("git")) detected.add("git");
    }
  }

  // System commands are always available
  detected.add("system");

  // Filter registry to only show relevant commands
  return COMMAND_REGISTRY
    .filter(cmd => detected.has(cmd.category) || cmd.category === "system")
    .map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      category: cmd.category,
      riskLevel: cmd.riskLevel,
      requiresConfirmation: cmd.requiresConfirmation,
      icon: cmd.icon,
      params: cmd.params,
      available: true,
    }));
}

// ─── Get execution history ────────────────────────────────────────────────

export async function getCommandHistory(serverId: string, limit = 20): Promise<CommandExecution[]> {
  const records = await prisma.usageRecord.findMany({
    where: { type: "command_execution", metadata: { path: ["serverId"], equals: serverId } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map(r => {
    const m = r.metadata as any;
    return {
      id: r.id,
      serverId: m.serverId,
      commandId: m.commandId,
      commandName: m.commandName,
      command: m.command,
      status: m.status,
      stdout: m.stdout ?? "",
      stderr: m.stderr ?? "",
      exitCode: m.exitCode ?? null,
      durationMs: m.durationMs ?? null,
      startedAt: m.startedAt ?? null,
      completedAt: m.completedAt ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ─── Get single execution ─────────────────────────────────────────────────

export async function getExecution(executionId: string): Promise<CommandExecution | null> {
  const r = await prisma.usageRecord.findUnique({ where: { id: executionId } });
  if (!r || r.type !== "command_execution") return null;
  const m = r.metadata as any;
  return {
    id: r.id, serverId: m.serverId, commandId: m.commandId,
    commandName: m.commandName, command: m.command, status: m.status,
    stdout: m.stdout ?? "", stderr: m.stderr ?? "",
    exitCode: m.exitCode ?? null, durationMs: m.durationMs ?? null,
    startedAt: m.startedAt, completedAt: m.completedAt,
    createdAt: r.createdAt.toISOString(),
  };
}
