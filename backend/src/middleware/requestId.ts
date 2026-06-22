/**
 * requestId.ts
 *
 * Assigns a unique request ID to every incoming request.
 * Used for distributed tracing and log correlation.
 */

import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || randomUUID().slice(0, 12);
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
