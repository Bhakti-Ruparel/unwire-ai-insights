/**
 * commandRoutes.ts
 *
 * Server Command Center API routes.
 */

import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireServerOwnership } from "../middleware/requireOwnership";
import { COMMAND_REGISTRY, searchCommands, getCategories, getCommandById } from "./commandRegistry";
import * as svc from "./commandService";
import type { Request, Response } from "express";

const router = Router();

// ─── Registry (public catalog) ────────────────────────────────────────────

router.get("/registry", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      commands: COMMAND_REGISTRY.map(c => ({ ...c, command: undefined })),
      categories: getCategories(),
      total: COMMAND_REGISTRY.length,
    },
  });
});

router.get("/registry/search", (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? "";
  const results = searchCommands(q);
  res.json({ success: true, data: results.map(c => ({ ...c, command: undefined })) });
});

// ─── Dynamic commands for a specific server ───────────────────────────────
// Returns only commands relevant to what's actually installed on this server

router.get("/servers/:id/available", authenticate, requireServerOwnership, async (req: Request, res: Response) => {
  try {
    const available = await svc.getAvailableCommands(req.params.id);
    res.json({ success: true, data: { commands: available, categories: [...new Set(available.map(c => c.category))] } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to detect available commands." });
  }
});

// ─── Server-specific command execution ────────────────────────────────────

router.post("/servers/:id/execute", authenticate, requireServerOwnership, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { commandId, params } = req.body;
    if (!commandId) { res.status(400).json({ success: false, error: "commandId is required." }); return; }

    // Verify command exists
    const cmd = getCommandById(commandId);
    if (!cmd) { res.status(404).json({ success: false, error: "Command not found." }); return; }

    // RBAC: MEMBER can only run low-risk commands
    const orgRole = (req as any).org?.role;
    if (orgRole === "MEMBER" && cmd.riskLevel !== "low") {
      res.status(403).json({ success: false, error: "Members can only execute low-risk commands. Ask an admin." });
      return;
    }

    const execution = await svc.executeCommand({
      serverId: req.params.id,
      commandId,
      params,
      userId,
      organizationId: (req as any).org?.id,
    });

    res.status(202).json({ success: true, data: execution });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Execution failed.";
    res.status(400).json({ success: false, error: msg });
  }
});

// ─── Get execution result ─────────────────────────────────────────────────

router.get("/executions/:executionId", authenticate, async (req: Request, res: Response) => {
  try {
    const execution = await svc.getExecution(req.params.executionId);
    if (!execution) { res.status(404).json({ success: false, error: "Execution not found." }); return; }
    res.json({ success: true, data: execution });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch execution." });
  }
});

// ─── Command history for a server ─────────────────────────────────────────

router.get("/servers/:id/history", authenticate, requireServerOwnership, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await svc.getCommandHistory(req.params.id, limit);
    res.json({ success: true, data: history });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch history." });
  }
});

export default router;
