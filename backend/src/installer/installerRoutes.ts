/**
 * installerRoutes.ts
 *
 * Serves the dynamic agent installer script and the Node.js agent file.
 * The installer downloads and installs the agent as a systemd service.
 *
 * Endpoints:
 *   GET /install.sh                     — Dynamic bash installer script
 *   GET /downloads/unwire-agent.js      — The actual Node.js agent file
 *   GET /api/agent/version              — Agent version metadata
 *   GET /api/agent/install-cmd/:id      — Generate install command for a server
 */

import { Router } from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/authenticate";
import { generateInstallerScript } from "./installerScript";
import { generateNodeAgent } from "./nodeAgent";

const router = Router();

const AGENT_VERSION = "1.0.1";

/**
 * GET /install.sh — Dynamic bash installer
 */
router.get("/install.sh", (_req: Request, res: Response) => {
  const script = generateInstallerScript(AGENT_VERSION, getPublicUrl());
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.send(script);
});

/**
 * GET /downloads/unwire-agent.js — The Node.js agent source
 * This is what gets installed on the VPS when Go binary is unavailable.
 */
router.get("/downloads/unwire-agent.js", (_req: Request, res: Response) => {
  const agentSource = generateNodeAgent(AGENT_VERSION);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(agentSource);
});

/**
 * GET /downloads/unwire-agent-linux-amd64 (and other platforms)
 * Returns 404 with helpful message if Go binary not available.
 */
router.get("/downloads/unwire-agent-:platform", (_req: Request, res: Response) => {
  // Go binary would be served here from a build artifact
  // For now, the installer falls back to Node.js agent
  res.status(404).json({
    success: false,
    error: "Pre-compiled binary not available. Installer will use Node.js agent automatically.",
  });
});

/**
 * GET /api/agent/version — Agent metadata
 */
router.get("/api/agent/version", (_req: Request, res: Response) => {
  const baseUrl = getPublicUrl();
  res.json({
    success: true,
    data: {
      version: AGENT_VERSION,
      runtime: "node",
      downloadUrl: `${baseUrl}/downloads/unwire-agent.js`,
      installerUrl: `${baseUrl}/install.sh`,
    },
  });
});

/**
 * GET /api/agent/install-cmd/:serverId — Generate install command
 */
router.get("/api/agent/install-cmd/:serverId", authenticate, async (req: Request, res: Response) => {
  try {
    const { prisma } = await import("../database/db");
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { agentToken: true },
    });
    if (!server) { res.status(404).json({ success: false, error: "Server not found." }); return; }

    const baseUrl = getPublicUrl();
    const cmd = `curl -fsSL ${baseUrl}/install.sh | sudo bash -s -- --token "${server.agentToken}" --server "${baseUrl}"`;

    res.json({ success: true, data: { command: cmd, token: server.agentToken, serverUrl: baseUrl } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to generate install command." });
  }
});

// ─── Helper: resolve public URL ───────────────────────────────────────────

function getPublicUrl(): string {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, "");

  const port = process.env.PORT ?? "5000";
  const lanIp = getLocalIp();
  return `http://${lanIp}:${port}`;
}

function getLocalIp(): string {
  try {
    const os = require("os");
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

export default router;
