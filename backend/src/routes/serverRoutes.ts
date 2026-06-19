import { Router } from "express";
import * as ctrl from "../controllers/serverController";
import { authenticate } from "../middleware/authenticate";
import { requireAgentOrOwnership, requireServerOwnerOrAdmin, requireServerOwnership } from "../middleware/requireOwnership";
import { agentPushLimiter } from "../middleware/rateLimiter";

const router = Router();

// ─── CRUD — require authentication ────────────────────────────────────────
router.get("/",    authenticate, ctrl.listServers);
router.post("/",   authenticate, ctrl.createServer);

// All single-server routes require auth + ownership
router.get("/:id",    authenticate, requireServerOwnership, ctrl.getServer);
router.delete("/:id", authenticate, requireServerOwnership, ctrl.deleteServer);
router.post("/:id/regenerate-token", authenticate, requireServerOwnerOrAdmin, ctrl.regenerateAgentToken);

// Health & Metrics — user reads require ownership; agent push uses agent token
router.get("/:id/health",   authenticate, requireServerOwnership, ctrl.getServerHealth);
router.get("/:id/metrics",  authenticate, requireServerOwnership, ctrl.getServerMetrics);
router.post("/:id/metrics", agentPushLimiter, requireAgentOrOwnership, ctrl.pushMetrics);
router.post("/:id/heartbeat", agentPushLimiter, requireAgentOrOwnership, ctrl.pushHeartbeat);

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
