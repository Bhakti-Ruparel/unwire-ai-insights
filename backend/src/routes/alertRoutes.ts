/**
 * alertRoutes.ts
 *
 * Routes for alerts and notifications.
 */

import { Router } from "express";
import * as ctrl from "../controllers/alertController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

// Alerts
router.get("/",                authenticate, ctrl.listAlerts);
router.get("/summary",         authenticate, ctrl.alertSummary);
router.patch("/:id/acknowledge", authenticate, ctrl.acknowledge);
router.patch("/:id/resolve",   authenticate, ctrl.resolve);

// Notifications
router.get("/notifications",         authenticate, ctrl.listNotifications);
router.patch("/notifications/read-all", authenticate, ctrl.markAllRead);

export default router;
