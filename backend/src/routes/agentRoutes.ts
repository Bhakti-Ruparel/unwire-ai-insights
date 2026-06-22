/**
 * agentRoutes.ts
 *
 * Routes for the AI DevOps Agent.
 * All routes require authentication.
 */

import { Router } from "express";
import * as ctrl from "../controllers/agentController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

// Agent chat — requires authentication
router.post("/chat", authenticate, ctrl.agentChat);

// Agent health check — requires authentication
router.get("/health", authenticate, ctrl.agentHealth);

export default router;
