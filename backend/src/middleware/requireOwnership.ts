/**
 * requireOwnership.ts
 *
 * Centralized ownership-check middleware factories.
 * Eliminates IDOR vulnerabilities across all resource routes.
 *
 * Usage:
 *   router.get("/:id/apis", requireProjectOwnership, controller.getAPIs)
 *   router.delete("/:id",   requireServerOwnership,  controller.deleteServer)
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/db";
import { authenticate } from "./authenticate";

// ─── Project ownership ────────────────────────────────────────────────────

/**
 * Verifies req.user owns the project at req.params.id.
 * Attaches req.project for downstream handlers.
 */
export async function requireProjectOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId    = req.user?.userId;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, name: true, userId: true, analysisStatus: true },
  });

  if (!project) {
    res.status(403).json({ success: false, error: "Project not found or access denied." });
    return;
  }

  (req as any).project = project;
  next();
}

// ─── Server ownership ─────────────────────────────────────────────────────

/**
 * Verifies req.user owns the server at req.params.id.
 * Agent push endpoints (metrics/logs) are authenticated by agentToken instead.
 */
export async function requireServerOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId   = req.user?.userId;
  const serverId = req.params.id;

  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const server = await prisma.server.findFirst({
    where: { id: serverId, userId },
    select: { id: true, name: true, userId: true },
  });

  if (!server) {
    res.status(403).json({ success: false, error: "Server not found or access denied." });
    return;
  }

  (req as any).server = server;
  next();
}

/**
 * Verifies req.user owns the server or has ADMIN role.
 * Use for sensitive owner/admin actions such as token regeneration.
 */
export async function requireServerOwnerOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId   = req.user?.userId;
  const role     = req.user?.role;
  const serverId = req.params.id;

  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const server = await prisma.server.findFirst({
    where: role === "ADMIN" ? { id: serverId } : { id: serverId, userId },
    select: { id: true, name: true, userId: true },
  });

  if (!server) {
    res.status(403).json({ success: false, error: "Server not found or access denied." });
    return;
  }

  (req as any).server = server;
  next();
}

// ─── Agent token auth (for push endpoints) ────────────────────────────────

/**
 * Authenticates server agent push requests or regular owner requests.
 * Agent sends: Authorization: Bearer <agentToken>
 * User sends:  Authorization: Bearer <jwt>
 */
export async function requireAgentOrOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const bearer = auth.slice(7).trim();
  if (!bearer) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const agentServer = await prisma.server.findUnique({
    where: { agentToken: bearer },
    select: { id: true, name: true, userId: true },
  });

  if (agentServer) {
    if (agentServer.id !== req.params.id) {
      res.status(403).json({ success: false, error: "Agent token is not valid for this server." });
      return;
    }
    (req as any).server = agentServer;
    next();
    return;
  }

  authenticate(req, res, () => {
    void requireServerOwnership(req, res, next);
  });
}

// ─── Audit logging helper ────────────────────────────────────────────────

/**
 * Records an action in usage_records for audit trail.
 * Non-blocking — never throws.
 */
export async function auditLog(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.usageRecord.create({
      data: {
        id:       require("crypto").randomUUID(),
        userId,
        type:     "api_request",
        metadata: { action, ...metadata } as any,
      },
    });
  } catch {
    // Audit log must never block or throw
  }
}
