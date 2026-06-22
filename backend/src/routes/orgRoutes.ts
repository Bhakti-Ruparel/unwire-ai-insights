/**
 * orgRoutes.ts
 *
 * Organization management routes: billing, members, invitations, API keys, audit.
 */

import { Router } from "express";
import * as ctrl from "../controllers/orgController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

// Organization
router.get("/",      authenticate, ctrl.getOrganization);
router.post("/",     authenticate, ctrl.createOrganization);

// Billing
router.get("/billing",          authenticate, ctrl.getBilling);
router.post("/billing/upgrade", authenticate, ctrl.upgradePlan);

// Members
router.delete("/members/:userId",      authenticate, ctrl.removeMember);
router.patch("/members/:userId/role",   authenticate, ctrl.updateMemberRole);

// Invitations
router.get("/invitations",              authenticate, ctrl.listInvitations);
router.post("/invitations",             authenticate, ctrl.inviteMember);
router.post("/invitations/:token/accept", authenticate, ctrl.acceptInvitation);
router.get("/invitations/:token/info",  ctrl.getInvitationInfo);  // Public — no auth required
router.delete("/invitations/:id",       authenticate, ctrl.revokeInvitation);

// API Keys
router.get("/api-keys",       authenticate, ctrl.listApiKeys);
router.post("/api-keys",      authenticate, ctrl.createApiKey);
router.delete("/api-keys/:id", authenticate, ctrl.revokeApiKey);

// Audit
router.get("/audit", authenticate, ctrl.getAuditLogs);

export default router;
