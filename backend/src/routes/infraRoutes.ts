/**
 * infraRoutes.ts
 *
 * Multi-cloud infrastructure management routes.
 */

import { Router } from "express";
import * as ctrl from "../controllers/infraController";
import { authenticate } from "../middleware/authenticate";
import { withOrgContext } from "../middleware/organizationContext";
import { validate } from "../middleware/validate";
import { connectProviderSchema, disconnectProviderSchema } from "../schemas";

const router = Router();

router.get("/providers",     ctrl.listProviders);                  // Public — shows available providers
router.get("/connections",   authenticate, withOrgContext, ctrl.listConnections);
router.get("/resources",     authenticate, withOrgContext, ctrl.listResources);
router.get("/summary",       authenticate, withOrgContext, ctrl.getSummary);
router.post("/connect",      authenticate, withOrgContext, validate(connectProviderSchema), ctrl.connect);
router.post("/disconnect",   authenticate, withOrgContext, validate(disconnectProviderSchema), ctrl.disconnect);
router.post("/sync/:id",     authenticate, withOrgContext, ctrl.syncConnection);

export default router;
