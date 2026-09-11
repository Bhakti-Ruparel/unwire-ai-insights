import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import * as ctrl from "../controllers/serverController";
import { authenticate } from "../middleware/authenticate";
import { requireAgentOrOwnership, requireServerOwnerOrAdmin, requireServerOwnership } from "../middleware/requireOwnership";
import { agentPushLimiter } from "../middleware/rateLimiter";
import { subscribeToServerEvents } from "../servers/serverSSE";
import { enforceServerLimit } from "../middleware/subscriptionGuard";
import { withOrgContext } from "../middleware/organizationContext";
import { validate } from "../middleware/validate";
import { createServerSchema } from "../schemas";
import { verifyToken } from "../services/authService";

const router = Router();

// SSE auth: supports token in query param (EventSource can't set headers)
function sseAuth(req: Request, res: Response, next: NextFunction): void {
  // Try standard Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(authHeader.slice(7));
      next();
      return;
    } catch { /* fall through to query param */ }
  }
  // Fallback: token in query parameter
  const queryToken = req.query.token as string;
  if (queryToken) {
    try {
      req.user = verifyToken(queryToken);
      next();
      return;
    } catch { /* invalid token */ }
  }
  res.status(401).json({ success: false, error: "Authentication required." });
}

// ─── CRUD — require authentication + org context ──────────────────────────
router.get("/",    authenticate, withOrgContext, ctrl.listServers);
router.post("/",   authenticate, withOrgContext, enforceServerLimit, validate(createServerSchema), ctrl.createServer);

// All single-server routes require auth + ownership
router.get("/:id",    authenticate, requireServerOwnership, ctrl.getServer);
router.delete("/:id", authenticate, requireServerOwnership, ctrl.deleteServer);
router.post("/:id/regenerate-token", authenticate, requireServerOwnerOrAdmin, ctrl.regenerateAgentToken);

// Health & Metrics — user reads require ownership; agent push uses agent token
router.get("/:id/health",        authenticate, requireServerOwnership, ctrl.getServerHealth);
router.get("/:id/agent-health",  authenticate, requireServerOwnership, ctrl.getAgentHealth);
router.get("/:id/metrics",       authenticate, requireServerOwnership, ctrl.getServerMetrics);
router.post("/:id/metrics", agentPushLimiter, requireAgentOrOwnership, ctrl.pushMetrics);
router.post("/:id/heartbeat", agentPushLimiter, requireAgentOrOwnership, ctrl.pushHeartbeat);

// Real-time updates via Server Sent Events (supports token in query for EventSource)
router.get("/:id/events", sseAuth, requireServerOwnership, subscribeToServerEvents);

// Applications — user only
router.get("/:id/apps",                  authenticate, requireServerOwnership, ctrl.getServerApps);
router.post("/:id/apps/:appName/action", authenticate, requireServerOwnership, ctrl.appAction);

// Logs — user reads require ownership; agent push uses agent token
router.get("/:id/logs",  authenticate, requireServerOwnership, ctrl.getServerLogs);
router.post("/:id/logs", agentPushLimiter, requireAgentOrOwnership, ctrl.pushLogs);

// Domains & SSL
router.get("/:id/domains",              authenticate, requireServerOwnership, ctrl.getDomains);
router.post("/:id/domains",             authenticate, requireServerOwnership, ctrl.addDomain);
router.delete("/:id/domains/:domainId", authenticate, requireServerOwnership, ctrl.deleteDomain);
router.get("/:id/ssl",                  authenticate, requireServerOwnership, ctrl.getSslCerts);
router.post("/:id/ssl",                 authenticate, requireServerOwnership, ctrl.addSslCert);

// AI assistant
router.post("/:id/ask", authenticate, requireServerOwnership, ctrl.askServer);

export default router;
