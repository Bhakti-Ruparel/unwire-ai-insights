/**
 * orgController.ts
 *
 * Organization management: billing, members, invitations, API keys, audit.
 */

import type { Request, Response } from "express";
import { prisma } from "../database/db";
import * as subSvc from "../billing/subscriptionService";
import * as inviteSvc from "../billing/invitationService";
import * as apiKeySvc from "../billing/apiKeyService";
import * as auditSvc from "../billing/auditService";
import { recordAudit } from "../billing/auditService";
import { sendInvitationEmail } from "../services/emailService";

// ─── GET /api/org ─────────────────────────────────────────────────────────
export async function getOrganization(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId },
      include: { organization: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } } },
    });

    if (!membership) { res.json({ success: true, data: null }); return; }
    res.json({ success: true, data: { organization: membership.organization, role: membership.role } });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch organization." }); }
}

// ─── POST /api/org ────────────────────────────────────────────────────────
export async function createOrganization(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { name } = req.body as { name?: string };
    if (!name?.trim()) { res.status(400).json({ success: false, error: "Organization name required." }); return; }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const org = await prisma.organization.create({
      data: { name: name.trim(), slug: `${slug}-${Date.now().toString(36)}`, ownerId: userId },
    });
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId, role: "OWNER" },
    });
    await subSvc.getSubscription(org.id); // Create free subscription
    recordAudit({ organizationId: org.id, userId, action: "org.created", resource: `org:${org.id}` });
    res.status(201).json({ success: true, data: org });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message ?? "Failed to create organization." });
  }
}

// ─── GET /api/org/billing ─────────────────────────────────────────────────
export async function getBilling(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const data = await subSvc.getSubscriptionWithLimits(orgId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch billing." }); }
}

// ─── POST /api/org/billing/upgrade ────────────────────────────────────────
export async function upgradePlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const perm = await requireOrgRole(userId, ["OWNER", "ADMIN"]);
    if (!perm.allowed) { res.status(403).json({ success: false, error: perm.error }); return; }
    const orgId = perm.orgId!;
    const { plan } = req.body as { plan?: string };
    if (!plan || !["free", "pro", "enterprise"].includes(plan)) {
      res.status(400).json({ success: false, error: "Valid plan required (free, pro, enterprise)." }); return;
    }
    const sub = await subSvc.upgradePlan(orgId, plan as any);
    recordAudit({ organizationId: orgId, userId, action: "billing.upgrade", metadata: { plan } });
    res.json({ success: true, data: sub });
  } catch { res.status(500).json({ success: false, error: "Failed to upgrade plan." }); }
}

// ─── POST /api/org/invitations ────────────────────────────────────────────
export async function inviteMember(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    // Permission check: only OWNER or ADMIN can invite
    const membership = await prisma.organizationMember.findFirst({ where: { userId }, select: { organizationId: true, role: true } });
    if (!membership) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    if (!["OWNER", "ADMIN"].includes(membership.role)) {
      res.status(403).json({ success: false, error: "Only owners and admins can invite members." }); return;
    }

    const orgId = membership.organizationId;
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email?.trim()) { res.status(400).json({ success: false, error: "Email required." }); return; }

    const result = await inviteSvc.createInvitation({
      organizationId: orgId, email: email.trim().toLowerCase(),
      role: role ?? "DEVELOPER", invitedBy: userId,
    });
    if ("error" in result) { res.status(400).json({ success: false, error: result.error }); return; }

    // Send invitation email (awaited — report delivery status)
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });

    const emailResult = await sendInvitationEmail({
      to: email.trim().toLowerCase(),
      orgName: org?.name ?? "Unknown",
      inviterName: inviter?.name || inviter?.email || "A team member",
      role: role ?? "DEVELOPER",
      token: result.token,
    });

    recordAudit({ organizationId: orgId, userId, action: "member.invited", metadata: { email, role } });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        token: result.token,
        emailSent: emailResult.sent,
        emailMethod: emailResult.method,
        ...(emailResult.error ? { emailError: "Email delivery failed. The invitation link was created — share it manually." } : {}),
      },
    });
  } catch { res.status(500).json({ success: false, error: "Failed to send invitation." }); }
}

// ─── GET /api/org/invitations ─────────────────────────────────────────────
export async function listInvitations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const data = await inviteSvc.listInvitations(orgId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to list invitations." }); }
}

// ─── POST /api/org/invitations/:token/accept ──────────────────────────────
export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    // Get authenticated user's email
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) { res.status(401).json({ success: false, error: "User not found." }); return; }

    // Verify the invitation exists and get invited email
    const invite = await prisma.invitation.findUnique({ where: { token: req.params.token } });
    if (!invite) { res.status(404).json({ success: false, error: "Invalid invitation link." }); return; }

    // EMAIL MATCH CHECK — prevent wrong account from accepting
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      console.warn(`[invitation] Email mismatch: authenticated=${user.email}, invited=${invite.email}`);
      res.status(403).json({
        success: false,
        error: `This invitation was sent to ${invite.email}. You are logged in as ${user.email}. Please log out and sign in with the invited email.`,
      });
      return;
    }

    const result = await inviteSvc.acceptInvitation(req.params.token, userId);
    if (!result.success) { res.status(400).json({ success: false, error: result.error }); return; }

    console.log(`[invitation] Accepted: token=${req.params.token}, user=${user.email}, org=${result.orgName}`);
    recordAudit({ userId, action: "member.joined", metadata: { token: req.params.token, org: result.orgName } });
    res.json({ success: true, data: { message: "Invitation accepted.", orgName: result.orgName } });
  } catch { res.status(500).json({ success: false, error: "Failed to accept invitation." }); }
}

// ─── GET /api/org/invitations/:token/info (PUBLIC — no auth) ──────────────
export async function getInvitationInfo(req: Request, res: Response): Promise<void> {
  try {
    const invite = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { organization: { select: { name: true } } },
    });

    if (!invite) {
      res.status(404).json({ success: false, error: "Invitation not found." });
      return;
    }

    // Return limited public info (no sensitive data)
    res.json({
      success: true,
      data: {
        email: invite.email,
        organizationName: invite.organization.name,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        expired: new Date() > invite.expiresAt,
      },
    });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch invitation." }); }
}

// ─── DELETE /api/org/invitations/:id ──────────────────────────────────────
export async function revokeInvitation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    await inviteSvc.revokeInvitation(req.params.id, orgId);
    res.json({ success: true, data: { message: "Invitation revoked." } });
  } catch { res.status(500).json({ success: false, error: "Failed to revoke invitation." }); }
}

// ─── POST /api/org/api-keys ───────────────────────────────────────────────
export async function createApiKey(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const perm = await requireOrgRole(userId, ["OWNER", "ADMIN"]);
    if (!perm.allowed) { res.status(403).json({ success: false, error: perm.error }); return; }
    const orgId = perm.orgId!;
    const { name, permissions } = req.body as { name?: string; permissions?: string[] };
    if (!name?.trim()) { res.status(400).json({ success: false, error: "API key name required." }); return; }
    const result = await apiKeySvc.createApiKey({
      organizationId: orgId, name: name.trim(),
      permissions: permissions ?? ["read"], createdBy: userId,
    });
    recordAudit({ organizationId: orgId, userId, action: "apikey.created", metadata: { name, prefix: result.prefix } });
    res.status(201).json({ success: true, data: result });
  } catch { res.status(500).json({ success: false, error: "Failed to create API key." }); }
}

// ─── GET /api/org/api-keys ────────────────────────────────────────────────
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const data = await apiKeySvc.listApiKeys(orgId);
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to list API keys." }); }
}

// ─── DELETE /api/org/api-keys/:id ─────────────────────────────────────────
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    await apiKeySvc.revokeApiKey(req.params.id, orgId);
    recordAudit({ organizationId: orgId, userId, action: "apikey.revoked", metadata: { keyId: req.params.id } });
    res.json({ success: true, data: { message: "API key revoked." } });
  } catch { res.status(500).json({ success: false, error: "Failed to revoke API key." }); }
}

// ─── GET /api/org/audit ───────────────────────────────────────────────────
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const { action, limit, cursor } = req.query;
    const data = await auditSvc.listAuditLogs({
      organizationId: orgId,
      action: action as string,
      limit: limit ? parseInt(limit as string) : undefined,
      cursor: cursor as string,
    });
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch audit logs." }); }
}

// ─── DELETE /api/org/members/:userId ──────────────────────────────────────
export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const targetId = req.params.userId;
    if (targetId === userId) { res.status(400).json({ success: false, error: "Cannot remove yourself." }); return; }
    await prisma.organizationMember.deleteMany({ where: { organizationId: orgId, userId: targetId } });
    recordAudit({ organizationId: orgId, userId, action: "member.removed", metadata: { targetId } });
    res.json({ success: true, data: { message: "Member removed." } });
  } catch { res.status(500).json({ success: false, error: "Failed to remove member." }); }
}

// ─── PATCH /api/org/members/:userId/role ──────────────────────────────────
export async function updateMemberRole(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }
    const orgId = await getOrgId(userId);
    if (!orgId) { res.status(404).json({ success: false, error: "No organization found." }); return; }
    const { role } = req.body as { role?: string };
    if (!role || !["OWNER", "ADMIN", "DEVELOPER", "VIEWER"].includes(role)) {
      res.status(400).json({ success: false, error: "Valid role required." }); return;
    }
    await prisma.organizationMember.updateMany({
      where: { organizationId: orgId, userId: req.params.userId },
      data: { role },
    });
    res.json({ success: true, data: { message: "Role updated." } });
  } catch { res.status(500).json({ success: false, error: "Failed to update role." }); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
async function getOrgId(userId: string): Promise<string | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId }, select: { organizationId: true }, orderBy: { joinedAt: "asc" },
  });
  return m?.organizationId ?? null;
}

async function requireOrgRole(userId: string, allowedRoles: string[]): Promise<{ allowed: boolean; orgId?: string; error?: string }> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId }, select: { organizationId: true, role: true }, orderBy: { joinedAt: "asc" },
  });
  if (!m) return { allowed: false, error: "No organization found. Create one first." };
  if (!allowedRoles.includes(m.role)) {
    return { allowed: false, error: `This action requires ${allowedRoles.join(" or ")} role.` };
  }
  return { allowed: true, orgId: m.organizationId };
}
