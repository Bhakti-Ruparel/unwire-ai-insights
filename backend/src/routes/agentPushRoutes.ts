/**
 * agentPushRoutes.ts
 *
 * Dedicated routes for the Unwire AI server monitoring agent.
 * These endpoints are authenticated via agent token (NOT JWT).
 * Separate from the AI agent chat routes.
 *
 * All heavy processing is offloaded to BullMQ queues.
 */

import { Router } from "express";
import * as ctrl from "../controllers/agentPushController";
import { requireAgentToken, requireAgentOrToken } from "../middleware/agentAuth";
import { agentPushLimiter } from "../middleware/rateLimiter";

const router = Router();

// Registration — agent sends token, gets serverId back
router.post("/register", agentPushLimiter, ctrl.registerAgent);

// Process discovery — agent reports running processes
router.post("/:serverId/processes", agentPushLimiter, requireAgentToken, ctrl.pushProcesses);

// Docker containers — agent reports container state
router.post("/:serverId/docker", agentPushLimiter, requireAgentToken, ctrl.pushDocker);

export default router;
