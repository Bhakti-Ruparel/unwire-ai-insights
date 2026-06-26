/**
 * agentRoutes.ts
 *
 * Routes for the AI DevOps Agent.
 * All routes require authentication + AI rate limiting.
 */

import { Router } from "express";
import * as ctrl from "../controllers/agentController";
import { authenticate } from "../middleware/authenticate";
import { enforceAILimit } from "../middleware/subscriptionGuard";
import { withOrgContext } from "../middleware/organizationContext";
import { validate } from "../middleware/validate";
import { agentChatSchema } from "../schemas";

const router = Router();

// Agent chat — requires authentication + org context + AI usage limit + validation
router.post("/chat", authenticate, withOrgContext, enforceAILimit, validate(agentChatSchema), ctrl.agentChat);

// Agent health check — requires authentication
router.get("/health", authenticate, ctrl.agentHealth);

export default router;
