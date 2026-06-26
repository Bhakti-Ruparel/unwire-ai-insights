/**
 * agentAuth.ts
 *
 * Middleware for authenticating server monitoring agent requests.
 * Agents use their unique agentToken (not JWT) for authentication.
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/db";

/**
 * requireAgentToken
 *
 * Validates the Bearer token against server agentTokens.
 * Sets req.agentServer with the server details.
 * Used for agent push endpoints (metrics, heartbeat, processes, docker, logs).
 */
export async function requireAgentToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Agent token required." });
    return;
  }

  const token = auth.slice(7).trim();
  if (!token) {
    res.status(401).json({ success: false, error: "Agent token required." });
    return;
  }

  const server = await prisma.server.findUnique({
    where: { agentToken: token },
    select: { id: true, name: true, userId: true, organizationId: true },
  });

  if (!server) {
    res.status(401).json({ success: false, error: "Invalid agent token." });
    return;
  }

  // Verify serverId matches if provided in URL
  const serverId = req.params.serverId ?? req.params.id;
  if (serverId && server.id !== serverId) {
    res.status(403).json({ success: false, error: "Token does not match server." });
    return;
  }

  (req as any).agentServer = server;
  next();
}

/**
 * requireAgentOrToken
 *
 * Allows either agent token auth OR JWT user auth.
 * Used for registration endpoint.
 */
export async function requireAgentOrToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const token = auth.slice(7).trim();

  // Try agent token first
  const server = await prisma.server.findUnique({
    where: { agentToken: token },
    select: { id: true, name: true, userId: true, organizationId: true },
  });

  if (server) {
    (req as any).agentServer = server;
    next();
    return;
  }

  // Fall back to JWT auth
  const { authenticate } = await import("./authenticate");
  authenticate(req, res, next);
}
