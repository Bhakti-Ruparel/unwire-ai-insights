/**
 * invitationService.ts
 *
 * Team invitation management.
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";
import { checkMemberLimit } from "./subscriptionService";

const INVITE_EXPIRY_DAYS = 7;

export async function createInvitation(opts: {
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
}): Promise<{ id: string; token: string } | { error: string }> {
  // Check member limit
  const limitCheck = await checkMemberLimit(opts.organizationId);
  if (!limitCheck.allowed) return { error: limitCheck.message! };

  // Check if already invited
  const existing = await prisma.invitation.findFirst({
    where: { organizationId: opts.organizationId, email: opts.email, status: "PENDING" },
  });
  if (existing) return { error: "This email already has a pending invitation." };

  // Check if already a member
  const user = await prisma.user.findUnique({ where: { email: opts.email }, select: { id: true } });
  if (user) {
    const isMember = await prisma.organizationMember.findFirst({
      where: { organizationId: opts.organizationId, userId: user.id },
    });
    if (isMember) return { error: "This user is already a member of the organization." };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.invitation.create({
    data: {
      organizationId: opts.organizationId,
      email: opts.email,
      role: opts.role,
      invitedBy: opts.invitedBy,
      token,
      expiresAt,
    },
  });

  return { id: invite.id, token: invite.token };
}

export async function acceptInvitation(token: string, userId: string): Promise<{ success: boolean; error?: string; orgName?: string }> {
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });
  if (!invite) return { success: false, error: "Invalid or expired invitation link." };
  if (invite.status === "ACCEPTED") return { success: false, error: "This invitation has already been accepted." };
  if (invite.status === "REVOKED") return { success: false, error: "This invitation has been revoked." };
  if (invite.status !== "PENDING") return { success: false, error: "Invitation is no longer valid." };
  if (new Date() > invite.expiresAt) {
    await prisma.invitation.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return { success: false, error: "This invitation has expired. Please ask for a new one." };
  }

  // Check if user is already a member of this org
  const existingMembership = await prisma.organizationMember.findFirst({
    where: { organizationId: invite.organizationId, userId },
  });

  if (existingMembership) {
    // Already a member — just mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return { success: true, orgName: invite.organization.name };
  }

  // Create membership and mark invitation accepted in a transaction
  await prisma.$transaction([
    prisma.organizationMember.create({
      data: { organizationId: invite.organizationId, userId, role: invite.role },
    }),
    prisma.invitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  return { success: true, orgName: invite.organization.name };
}

export async function listInvitations(organizationId: string) {
  return prisma.invitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function revokeInvitation(invitationId: string, organizationId: string) {
  await prisma.invitation.updateMany({
    where: { id: invitationId, organizationId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
}
