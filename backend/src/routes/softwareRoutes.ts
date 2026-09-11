/**
 * softwareRoutes.ts
 *
 * Software marketplace API routes.
 */

import { Router } from "express";
import * as ctrl from "../controllers/softwareController";
import { authenticate } from "../middleware/authenticate";
import { requireServerOwnership } from "../middleware/requireOwnership";

const router = Router();

// Registry (public catalog)
router.get("/registry",               ctrl.listRegistry);
router.get("/registry/search",        ctrl.searchRegistry);
router.get("/registry/:id",           ctrl.getRegistryEntry);

// Server-specific software management (requires auth + ownership)
router.get("/servers/:id/installed",  authenticate, requireServerOwnership, ctrl.getInstalled);
router.post("/servers/:id/install",   authenticate, requireServerOwnership, ctrl.installSoftware);
router.post("/servers/:id/uninstall", authenticate, requireServerOwnership, ctrl.uninstallSoftware);
router.post("/servers/:id/bootstrap", authenticate, requireServerOwnership, ctrl.bootstrapServer);

export default router;
