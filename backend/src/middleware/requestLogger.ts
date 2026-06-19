/**
 * requestLogger.ts
 *
 * Lightweight request + audit logging middleware.
 * Logs every API request with method, path, userId, status, and duration.
 */

import type { Request, Response, NextFunction } from "express";

/** Paths we skip to reduce noise */
const SKIP_PATHS = new Set(["/health", "/favicon.ico"]);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) { next(); return; }

  const start = Date.now();

  res.on("finish", () => {
    const ms     = Date.now() - start;
    const userId = req.user?.userId ?? "anon";
    const status = res.statusCode;
    const level  = status >= 500 ? "ERROR" : status >= 400 ? "WARN " : "INFO ";

    // Format: [INFO ] GET /api/projects 200 42ms user:abc123
    console.log(`[${level}] ${req.method.padEnd(6)} ${req.path.padEnd(40)} ${status} ${ms}ms user:${userId}`);

    // Log errors with body (never log sensitive fields)
    if (status >= 400) {
      const safe = sanitizeBody(req.body);
      if (Object.keys(safe).length > 0) {
        console.log(`        body: ${JSON.stringify(safe)}`);
      }
    }
  });

  next();
}

/** Strip sensitive fields from request body before logging */
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const SENSITIVE = new Set(["password", "passwordHash", "refreshToken", "token", "secret", "apiKey", "privateKey"]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!SENSITIVE.has(k)) result[k] = v;
  }
  return result;
}
