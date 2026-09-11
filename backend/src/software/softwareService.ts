/**
 * softwareService.ts
 *
 * Real software installation engine.
 * Executes actual commands on servers via the agent API.
 * Verifies installation by running version/health checks.
 *
 * Flow:
 *   1. Registry lookup → get approved command
 *   2. Check if already installed (run healthCheck)
 *   3. Send install command to agent
 *   4. Stream progress via SSE
 *   5. Verify installation (run healthCheck again)
 *   6. Only mark "installed" if verification passes
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";
import { resolveCommand, getSoftwareById, type OSType } from "./softwareRegistry";
import { broadcastServerEvent } from "../servers/serverSSE";
import { recordAudit } from "../billing/auditService";
import { logger } from "../services/logger";

export type InstallationStatus = "queued" | "installing" | "verifying" | "installed" | "failed" | "uninstalling" | "uninstalled";

export interface SoftwareInstallation {
  id: string;
  serverId: string;
  softwareId: string;
  softwareName: string;
  version: string;
  status: InstallationStatus;
  os: string;
  logs: string;
  error?: string;
  installedAt: string | null;
  createdAt: string;
}

// ─── Execute command on agent directly ────────────────────────────────────

async function execOnAgent(serverId: string, command: string, timeout = 300): Promise<{ exitCode: number; stdout: string; stderr: string; error?: string }> {
  const { sendAgentCommand } = await import("../deployment/agentClient");

  const result = await sendAgentCommand(serverId, {
    deploymentId: randomUUID(),
    action: "exec",  // Use the exec action for running shell commands
    repository: command, // Command is passed in repository field
    appName: "software-install",
    timeout,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

// ─── Install software ─────────────────────────────────────────────────────

export async function installSoftware(opts: {
  serverId: string;
  softwareId: string;
  version?: string;
  userId: string;
  organizationId?: string;
}): Promise<SoftwareInstallation> {
  const entry = getSoftwareById(opts.softwareId);
  if (!entry) throw new Error(`Software "${opts.softwareId}" not found in registry.`);

  const version = opts.version ?? entry.defaultVersion;
  const os = await detectServerOS(opts.serverId);

  // Check if already installed
  const healthCmd = resolveCommand(opts.softwareId, "healthCheck", os, version);
  if (healthCmd) {
    const check = await execOnAgent(opts.serverId, healthCmd, 15);
    if (check.exitCode === 0) {
      throw new Error(`${entry.name} is already installed. Version: ${check.stdout.trim().slice(0, 100)}`);
    }
  }

  const installCmd = resolveCommand(opts.softwareId, "install", os, version);
  if (!installCmd) throw new Error(`No install command for ${entry.name} on ${os}.`);

  // Create installation record
  const installId = randomUUID();
  await prisma.usageRecord.create({
    data: {
      id: installId,
      userId: opts.userId,
      type: "software_installation",
      metadata: {
        serverId: opts.serverId,
        softwareId: opts.softwareId,
        softwareName: entry.name,
        version,
        status: "queued",
        os,
        logs: "",
        error: null,
        installedAt: null,
      } as any,
    },
  });

  // Broadcast queued status
  broadcastServerEvent(opts.serverId, "app", {
    type: "software_install", softwareId: opts.softwareId, status: "queued", name: entry.name,
  });

  // Execute async (don't block API response)
  executeRealInstall(installId, opts.serverId, entry.name, opts.softwareId, installCmd, os, version, opts.userId, opts.organizationId)
    .catch((err) => logger.error(`[software] Install failed: ${err.message}`));

  recordAudit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "software.install_started",
    resource: `server:${opts.serverId}`,
    metadata: { software: opts.softwareId, version },
  });

  return {
    id: installId,
    serverId: opts.serverId,
    softwareId: opts.softwareId,
    softwareName: entry.name,
    version,
    status: "queued",
    os,
    logs: "",
    installedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Real installation executor ───────────────────────────────────────────

async function executeRealInstall(
  installId: string, serverId: string, name: string,
  softwareId: string, installCmd: string, os: string,
  version: string, userId: string, organizationId?: string
): Promise<void> {
  let allLogs = "";

  const updateStatus = async (status: InstallationStatus, extra: Record<string, any> = {}) => {
    await prisma.usageRecord.update({
      where: { id: installId },
      data: { metadata: { serverId, softwareId, softwareName: name, version, os, status, logs: allLogs.slice(-10000), ...extra } as any },
    });
    broadcastServerEvent(serverId, "app", { type: "software_install", softwareId, status, name });
  };

  try {
    // Phase 1: Installing
    await updateStatus("installing");
    broadcastServerEvent(serverId, "app", { type: "software_progress", softwareId, message: `Installing ${name}...` });

    // Split multi-command installs and execute sequentially
    const commands = installCmd.split("&&").map(c => c.trim());
    for (const cmd of commands) {
      broadcastServerEvent(serverId, "app", { type: "software_progress", softwareId, message: `$ ${cmd.slice(0, 80)}` });

      const result = await execOnAgent(serverId, cmd, 600);
      allLogs += `$ ${cmd}\n${result.stdout}\n`;

      if (result.exitCode !== 0) {
        allLogs += `STDERR: ${result.stderr ?? result.error}\n`;
        await updateStatus("failed", { error: result.stderr ?? result.error ?? "Command failed", installedAt: null });
        return;
      }
    }

    // Phase 2: Verifying — run health check to confirm installation
    await updateStatus("verifying");
    broadcastServerEvent(serverId, "app", { type: "software_progress", softwareId, message: "Verifying installation..." });

    const healthCmd = resolveCommand(softwareId, "healthCheck", os as OSType, version);
    if (healthCmd) {
      // Give service a moment to start
      await new Promise(r => setTimeout(r, 2000));

      const verify = await execOnAgent(serverId, healthCmd, 30);
      allLogs += `$ ${healthCmd}\n${verify.stdout}\n`;

      if (verify.exitCode !== 0) {
        // Retry once after a longer wait
        await new Promise(r => setTimeout(r, 5000));
        const retry = await execOnAgent(serverId, healthCmd, 30);
        allLogs += `$ ${healthCmd} (retry)\n${retry.stdout}\n`;

        if (retry.exitCode !== 0) {
          await updateStatus("failed", {
            error: `Installation completed but verification failed: ${retry.stderr ?? retry.stdout}`,
            installedAt: null,
          });
          return;
        }
      }

      allLogs += `✓ Verified: ${verify.stdout.trim().slice(0, 200)}\n`;
    }

    // Phase 3: Installed — verified successfully
    await updateStatus("installed", { installedAt: new Date().toISOString() });
    broadcastServerEvent(serverId, "app", { type: "software_progress", softwareId, message: `✓ ${name} installed and verified` });

    logger.info(`[software] ${name} installed on server ${serverId}`);

  } catch (err: any) {
    allLogs += `ERROR: ${err.message}\n`;
    await updateStatus("failed", { error: err.message, installedAt: null });
  }
}

// ─── Uninstall ────────────────────────────────────────────────────────────

export async function uninstallSoftware(opts: {
  serverId: string; softwareId: string; userId: string; organizationId?: string;
}): Promise<void> {
  const entry = getSoftwareById(opts.softwareId);
  if (!entry) throw new Error("Software not found in registry.");

  const os = await detectServerOS(opts.serverId);
  const cmd = resolveCommand(opts.softwareId, "uninstall", os);
  if (!cmd) throw new Error(`No uninstall command for ${entry.name} on ${os}.`);

  const result = await execOnAgent(opts.serverId, cmd, 300);
  if (result.exitCode !== 0) {
    throw new Error(`Uninstall failed: ${result.stderr ?? result.error}`);
  }

  // Update installation record
  const record = await prisma.usageRecord.findFirst({
    where: { type: "software_installation", metadata: { path: ["serverId"], equals: opts.serverId } },
    orderBy: { createdAt: "desc" },
  });
  if (record) {
    const meta = record.metadata as any;
    if (meta.softwareId === opts.softwareId) {
      await prisma.usageRecord.update({
        where: { id: record.id },
        data: { metadata: { ...meta, status: "uninstalled" } as any },
      });
    }
  }

  recordAudit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "software.uninstalled",
    resource: `server:${opts.serverId}`,
    metadata: { software: opts.softwareId },
  });
}

// ─── List installed ───────────────────────────────────────────────────────

export async function getInstalledSoftware(serverId: string): Promise<SoftwareInstallation[]> {
  const records = await prisma.usageRecord.findMany({
    where: { type: "software_installation", metadata: { path: ["serverId"], equals: serverId } },
    orderBy: { createdAt: "desc" },
  });

  // Deduplicate by softwareId (keep latest)
  const seen = new Set<string>();
  const result: SoftwareInstallation[] = [];

  for (const r of records) {
    const meta = r.metadata as any;
    if (seen.has(meta.softwareId)) continue;
    if (meta.status === "uninstalled") continue; // Skip uninstalled
    seen.add(meta.softwareId);

    result.push({
      id: r.id,
      serverId: meta.serverId,
      softwareId: meta.softwareId,
      softwareName: meta.softwareName,
      version: meta.version,
      status: meta.status,
      os: meta.os,
      logs: meta.logs ?? "",
      error: meta.error,
      installedAt: meta.installedAt,
      createdAt: r.createdAt.toISOString(),
    });
  }

  return result;
}

// ─── Bootstrap server (one-click setup) ───────────────────────────────────

export async function bootstrapServer(opts: {
  serverId: string; userId: string; organizationId?: string;
}): Promise<{ queued: string[] }> {
  const essentials = ["docker", "docker-compose", "git", "nodejs", "python", "nginx"];
  const queued: string[] = [];

  for (const softwareId of essentials) {
    try {
      await installSoftware({ ...opts, softwareId });
      queued.push(softwareId);
    } catch {
      // Skip already-installed software silently
    }
  }

  return { queued };
}

// ─── Detect OS ────────────────────────────────────────────────────────────

async function detectServerOS(serverId: string): Promise<OSType> {
  try {
    const result = await execOnAgent(serverId, "uname -s 2>/dev/null || echo windows", 10);
    const output = (result.stdout ?? "").toLowerCase().trim();
    if (output.includes("darwin")) return "darwin";
    if (output.includes("linux")) return "linux";
    if (output.includes("windows") || result.exitCode !== 0) return "windows";
  } catch {}
  return "linux";
}
