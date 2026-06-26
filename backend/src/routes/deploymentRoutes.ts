import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { enforceDeploymentLimit } from "../middleware/subscriptionGuard";
import { withOrgContext, requireOrgAdmin } from "../middleware/organizationContext";
import { validate } from "../middleware/validate";
import { createDeploymentSchema } from "../schemas";
import * as ctrl from "../controllers/deploymentController";

const router = Router();

// GitHub webhook — no auth (verified by signature)
router.post("/webhook/github", ctrl.handleGitHubWebhook);

// All other deployment routes require authentication
router.use(authenticate);
router.use(withOrgContext);

router.post("/",                    enforceDeploymentLimit, validate(createDeploymentSchema), ctrl.createDeployment);
router.get("/",                     ctrl.listDeployments);
router.get("/health",               ctrl.queueHealth);
router.get("/:id",                  ctrl.getDeployment);
router.get("/:id/logs",             ctrl.getDeploymentLogs);
router.get("/:id/logs/stream",      ctrl.streamDeploymentLogs);
router.post("/:id/rollback",        ctrl.rollbackDeployment);

export default router;
