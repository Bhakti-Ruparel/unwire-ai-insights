/**
 * authenticate.ts
 *
 * Express middleware for JWT-based auth + role checks.
 *
 * Usage:
 *   authenticate          — require any logged-in user
 *   requireAdmin          — require ADMIN role
 *   optionalAuth          — attach user if token present, never block
 */

import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthPayload } from "../services/authService";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// ─── Required auth ─────────────────────────────────────────────────────────

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token. Please log in again." });
  }
}

// ─── Admin-only ────────────────────────────────────────────────────────────

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  try {
    const payload = verifyToken(token);
    if (payload.role !== "ADMIN") {
      res.status(403).json({ success: false, error: "Admin access required." });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token." });
  }
}

// ─── Optional auth (never blocks) ─────────────────────────────────────────

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try { req.user = verifyToken(token); } catch { /* ignore */ }
  }
  next();
}

// ─── Helper ────────────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
