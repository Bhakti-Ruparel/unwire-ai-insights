/**
 * orgRoutes.ts
 *
 * Organization management routes: billing, members, invitations, API keys, audit.
 */

import { Router } from "express";
import * as ctrl from "../controllers/orgController";
import { authenticate } from "../middleware/authenticate";
import { withOrgContext, requireOrgOwner, requireOrgAdmin } from "../middleware/organizationContext";
import { validate } from "../middleware/validate";
import { createOrgSchema, inviteMemberSchema, updateMemberRoleSchema, checkoutSchema, verifyPaymentSchema } from "../schemas";

const router = Router();

// Organization
router.get("/",      authenticate, withOrgContext, ctrl.getOrganization);
router.post("/",     authenticate, validate(createOrgSchema), ctrl.createOrganization);

// Billing
router.get("/billing",              authenticate, withOrgContext, ctrl.getBilling);
router.post("/billing/upgrade",     authenticate, withOrgContext, ctrl.upgradePlan);
router.post("/billing/checkout",    authenticate, withOrgContext, validate(checkoutSchema), ctrl.createCheckout);
router.post("/billing/verify",      authenticate, withOrgContext, validate(verifyPaymentSchema), ctrl.verifyPayment);
router.post("/billing/cancel",      authenticate, withOrgContext, ctrl.cancelSubscription);
router.post("/billing/webhook/razorpay", ctrl.handleRazorpayWebhook); // No auth — verified by signature

// Members
router.delete("/members/:userId",      authenticate, withOrgContext, requireOrgAdmin, ctrl.removeMember);
router.patch("/members/:userId/role",   authenticate, withOrgContext, requireOrgAdmin, validate(updateMemberRoleSchema), ctrl.updateMemberRole);

// Invitations
router.get("/invitations",              authenticate, withOrgContext, ctrl.listInvitations);
router.post("/invitations",             authenticate, withOrgContext, requireOrgAdmin, validate(inviteMemberSchema), ctrl.inviteMember);
router.post("/invitations/:token/accept", authenticate, ctrl.acceptInvitation);
router.get("/invitations/:token/info",  ctrl.getInvitationInfo);  // Public — no auth required
router.delete("/invitations/:id",       authenticate, withOrgContext, requireOrgAdmin, ctrl.revokeInvitation);

// API Keys
router.get("/api-keys",       authenticate, withOrgContext, ctrl.listApiKeys);
router.post("/api-keys",      authenticate, withOrgContext, requireOrgAdmin, ctrl.createApiKey);
router.delete("/api-keys/:id", authenticate, withOrgContext, requireOrgAdmin, ctrl.revokeApiKey);

// Audit
router.get("/audit", authenticate, withOrgContext, ctrl.getAuditLogs);

export default router;
