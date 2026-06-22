/**
 * subscriptionService.ts
 *
 * Subscription management + usage enforcement.
 */

import { prisma } from "../database/db";
import { getPlanLimits, isWithinLimit, type PlanTier } from "./planConfig";

// ─── Get or create subscription ───────────────────────────────────────────

export async function getSubscription(organizationId: string) {
  let sub = await prisma.subscription.findUnique({ where: { organizationId } });
  if (!sub) {
    sub = await prisma.subscription.create({
      data: { organizationId, plan: "free", status: "active" },
    });
  }
  return sub;
}

// ─── Check resource limits ────────────────────────────────────────────────

export async function checkServerLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const org = await getOrgForUser(userId);
  if (!org) return { allowed: true }; // No org = no limit enforcement yet

  const sub = await getSubscription(org.id);
  const limits = getPlanLimits(sub.plan);
  const count = await prisma.server.count({ where: { organizationId: org.id } });

  if (!isWithinLimit(count, limits.maxServers)) {
    return { allowed: false, message: `You've reached the ${sub.plan} plan limit of ${limits.maxServers} server(s). Upgrade to add more.` };
  }
  return { allowed: true };
}

export async function checkProjectLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const org = await getOrgForUser(userId);
  if (!org) return { allowed: true };

  const sub = await getSubscription(org.id);
  const limits = getPlanLimits(sub.plan);
  const count = await prisma.project.count({
    where: { organizationId: org.id, NOT: { id: { startsWith: "agent-" } } },
  });

  if (!isWithinLimit(count, limits.maxProjects)) {
    return { allowed: false, message: `You've reached the ${sub.plan} plan limit of ${limits.maxProjects} project(s). Upgrade to add more.` };
  }
  return { allowed: true };
}

export async function checkMemberLimit(organizationId: string): Promise<{ allowed: boolean; message?: string }> {
  const sub = await getSubscription(organizationId);
  const limits = getPlanLimits(sub.plan);
  const count = await prisma.organizationMember.count({ where: { organizationId } });

  if (!isWithinLimit(count, limits.maxMembers)) {
    return { allowed: false, message: `You've reached the ${sub.plan} plan limit of ${limits.maxMembers} team member(s). Upgrade to add more.` };
  }
  return { allowed: true };
}

// ─── Plan management ──────────────────────────────────────────────────────

export async function upgradePlan(organizationId: string, newPlan: PlanTier) {
  return prisma.subscription.upsert({
    where: { organizationId },
    create: { organizationId, plan: newPlan, status: "active" },
    update: { plan: newPlan, status: "active", updatedAt: new Date() },
  });
}

export async function getSubscriptionWithLimits(organizationId: string) {
  const sub = await getSubscription(organizationId);
  const limits = getPlanLimits(sub.plan);
  const [serverCount, projectCount, memberCount] = await Promise.all([
    prisma.server.count({ where: { organizationId } }),
    prisma.project.count({ where: { organizationId, NOT: { id: { startsWith: "agent-" } } } }),
    prisma.organizationMember.count({ where: { organizationId } }),
  ]);
  return {
    ...sub,
    limits,
    usage: { servers: serverCount, projects: projectCount, members: memberCount },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getOrgForUser(userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
    orderBy: { joinedAt: "asc" },
  });
  return membership?.organization ?? null;
}
