/**
 * agentPushController.ts
 *
 * Handles data pushed by the Unwire AI server monitoring agent.
 * All heavy processing is queued via BullMQ (or processed inline as fallback).
 */

import type { Request, Response } from "express";
import { prisma } from "../database/db";
import * as svc from "../servers/serverService";
import { enqueueIngestion } from "../queue/ingestionQueue";
import { broadcastStatusChange } from "../servers/serverSSE";

// ─── POST /api/agent-push/register ────────────────────────────────────────
// Agent sends its token to get assigned serverId
export async function registerAgent(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Agent token required." });
      return;
    }

    const token = auth.slice(7).trim();
    const server = await prisma.server.findUnique({
      where: { agentToken: token },
      select: { id: true, name: true, host: true, status: true },
    });

    if (!server) {
      res.status(401).json({ success: false, error: "Invalid agent token." });
      return;
    }

    // Update server metadata from agent registration
    const { hostname, os, arch, version } = req.body;
    const updateData: any = { status: "online" };
    if (hostname && !server.host) updateData.host = hostname;

    await prisma.server.update({
      where: { id: server.id },
      data: updateData,
    });

    // Record heartbeat
    await svc.recordHeartbeat(server.id, {
      status: "online",
      agentVersion: version ?? "1.0.0",
    }, req.ip ?? "");

    broadcastStatusChange(server.id, "online");

    res.json({
      success: true,
      data: {
        serverId: server.id,
        serverName: server.name,
        message: "Agent registered successfully.",
      },
    });
  } catch (err) {
    console.error("[agentPush:register]", err);
    res.status(500).json({ success: false, error: "Registration failed." });
  }
}

// ─── POST /api/agent-push/:serverId/processes ─────────────────────────────
// Agent reports discovered processes/services
export async function pushProcesses(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.serverId;
    const { processes } = req.body;

    if (!Array.isArray(processes)) {
      res.status(400).json({ success: false, error: "processes must be an array." });
      return;
    }

    // Queue for async processing
    await enqueueIngestion({
      type: "PROCESS_DISCOVERY",
      serverId,
      data: { processes: processes.slice(0, 100) }, // Cap at 100
    });

    res.json({ success: true, data: { queued: processes.length } });
  } catch (err) {
    // Fallback: process inline if queue unavailable
    try {
      const serverId = req.params.serverId;
      const { processes } = req.body;
      await processDiscoveryInline(serverId, processes ?? []);
      res.json({ success: true, data: { processed: (processes ?? []).length } });
    } catch (fallbackErr) {
      console.error("[agentPush:processes]", fallbackErr);
      res.status(500).json({ success: false, error: "Failed to process." });
    }
  }
}

// ─── POST /api/agent-push/:serverId/docker ────────────────────────────────
// Agent reports Docker containers
export async function pushDocker(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.serverId;
    const { containers } = req.body;

    if (!Array.isArray(containers)) {
      res.status(400).json({ success: false, error: "containers must be an array." });
      return;
    }

    // Queue for async processing
    await enqueueIngestion({
      type: "DOCKER_DISCOVERY",
      serverId,
      data: { containers: containers.slice(0, 50) }, // Cap at 50
    });

    res.json({ success: true, data: { queued: containers.length } });
  } catch (err) {
    // Fallback: process inline
    try {
      const serverId = req.params.serverId;
      const { containers } = req.body;
      await dockerDiscoveryInline(serverId, containers ?? []);
      res.json({ success: true, data: { processed: (containers ?? []).length } });
    } catch (fallbackErr) {
      console.error("[agentPush:docker]", fallbackErr);
      res.status(500).json({ success: false, error: "Failed to process." });
    }
  }
}

// ─── Inline processing (fallback when queue unavailable) ──────────────────

async function processDiscoveryInline(serverId: string, processes: any[]): Promise<void> {
  const apps = processes.slice(0, 100).map((p: any) => ({
    name: p.name ?? "unknown",
    type: detectAppType(p.name ?? ""),
    status: "running" as const,
    port: p.port ?? null,
    pid: p.pid ?? null,
    uptime: "",
    memory: p.memory ?? 0,
    cpu: p.cpu ?? 0,
  }));

  await svc.replaceApps(serverId, apps);
}

async function dockerDiscoveryInline(serverId: string, containers: any[]): Promise<void> {
  const apps = containers.slice(0, 50).map((c: any) => ({
    name: c.name ?? c.id ?? "container",
    type: "docker",
    status: c.state === "running" ? "running" : "stopped",
    port: c.port ?? null,
    pid: null,
    uptime: c.uptime ?? "",
    memory: c.memory ?? 0,
    cpu: c.cpu ?? 0,
  }));

  await svc.replaceApps(serverId, apps);
}

function detectAppType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("node") || n.includes("next") || n.includes("express")) return "node";
  if (n.includes("python") || n.includes("flask") || n.includes("django")) return "python";
  if (n.includes("nginx")) return "nginx";
  if (n.includes("postgres")) return "postgresql";
  if (n.includes("mysql")) return "mysql";
  if (n.includes("redis")) return "redis";
  if (n.includes("mongo")) return "mongodb";
  if (n.includes("docker")) return "docker";
  if (n.includes("java")) return "java";
  return "process";
}
