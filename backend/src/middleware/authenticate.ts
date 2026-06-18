/**
 * authenticate.ts
 *
 * Express middleware that verifies the Bearer JWT token in the
 * Authorization header and attaches the decoded payload to req.user.
 *
 * Usage:
 *   router.get("/protected", authenticate, handler)
 */

import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthPayload } from "../services/authService";

// Extend Express Request to carry user payload
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token." });
  }
}
