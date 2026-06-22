/**
 * infraRoutes.ts
 *
 * Multi-cloud infrastructure management routes.
 */

import { Router } from "express";
import * as ctrl from "../controllers/infraController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

router.get("/providers",     ctrl.listProviders);                  // Public — shows available providers
router.get("/connections",   authenticate, ctrl.listConnections);
router.get("/resources",     authenticate, ctrl.listResources);
router.get("/summary",       authenticate, ctrl.getSummary);
router.post("/connect",      authenticate, ctrl.connect);
router.post("/disconnect",   authenticate, ctrl.disconnect);
router.post("/sync/:id",     authenticate, ctrl.syncConnection);

export default router;
