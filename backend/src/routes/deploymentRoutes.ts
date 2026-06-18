import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as ctrl from "../controllers/deploymentController";

const router = Router();

// All deployment routes require authentication
router.use(authenticate);

router.post("/",                    ctrl.createDeployment);
router.get("/",                     ctrl.listDeployments);
router.get("/health",               ctrl.queueHealth);
router.get("/:id",                  ctrl.getDeployment);
router.get("/:id/logs",             ctrl.getDeploymentLogs);
router.get("/:id/logs/stream",      ctrl.streamDeploymentLogs);
router.post("/:id/rollback",        ctrl.rollbackDeployment);

export default router;
