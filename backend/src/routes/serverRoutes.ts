import { Router } from "express";
import * as ctrl from "../controllers/serverController";

const router = Router();

// Servers CRUD
router.get("/",           ctrl.listServers);
router.post("/",          ctrl.createServer);
router.get("/:id",        ctrl.getServer);
router.delete("/:id",     ctrl.deleteServer);

// Health & Metrics
router.get("/:id/health",         ctrl.getServerHealth);
router.get("/:id/metrics",        ctrl.getServerMetrics);
router.post("/:id/metrics",       ctrl.pushMetrics);        // agent pushes

// Applications
router.get("/:id/apps",                        ctrl.getServerApps);
router.post("/:id/apps/:appName/action",       ctrl.appAction);

// Logs
router.get("/:id/logs",           ctrl.getServerLogs);
router.post("/:id/logs",          ctrl.pushLogs);           // agent pushes

// Domains
router.get("/:id/domains",              ctrl.getDomains);
router.post("/:id/domains",             ctrl.addDomain);
router.delete("/:id/domains/:domainId", ctrl.deleteDomain);

// SSL
router.get("/:id/ssl",            ctrl.getSslCerts);
router.post("/:id/ssl",           ctrl.addSslCert);

// AI assistant
router.post("/:id/ask",           ctrl.askServer);

export default router;
