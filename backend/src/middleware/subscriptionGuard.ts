/**
 * subscriptionGuard.ts
 *
 * Middleware that enforces subscription plan limits.
 * Checks resource limits before allowing creation actions.
 *
 * Usage:
 *   router.post("/", authenticate, checkServerLimit, ctrl.createServer)
 *   router.post("/", authenticate, checkDeploymentLimit, ctrl.createDeployment)
 */

import type { Request, Response, NextFunction } from "express";
import { checkServerLimit, checkProjectLimit } from "../billing/subscriptionService";
import { prisma } from "../database/db";
import { getPlanLimits, isWithinLimit } from "../billing/planConfig";

/**
 * Middleware: enforce server creation limit.
 */
export async function enforceServerLimit(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) { next(); return; }

  const result = await checkServerLimit(userId);
  if (!result.allowed) {
    res.status(403).json({ success: false, error: result.message });
    return;
  }
  next();
}

/**
 * Middleware: enforce project creation limit.
 */
export async function enforceProjectLimit(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) { next(); return; }

  const result = await checkProjectLimit(userId);
  if (!result.allowed) {
    res.status(403).json({ success: false, error: result.message });
    return;
  }
  next();
}

/**
 * Middleware: enforce deployment creation limit (monthly).
 */
export async function enforceDeploymentLimit(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) { next(); return; }

  const org = await getOrgForUser(userId);
  if (!org) { next(); return; }

  const sub = await prisma.subscription.findUnique({ where: { organizationId: org.id } });
  const limits = getPlanLimits(sub?.plan ?? "free");

  // Count deployments this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.deployment.count({
    where: { userId, createdAt: { gte: startOfMonth } },
  });

  if (!isWithinLimit(count, limits.maxDeploymentsPerMonth)) {
    res.status(403).json({
      success: false,
      error: `Monthly deployment limit reached (${limits.maxDeploymentsPerMonth}). Upgrade your plan for more deployments.`,
    });
    return;
  }
  next();
}

/**
 * Middleware: enforce AI request limit (daily).
 */
export async function enforceAILimit(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) { next(); return; }

  const org = await getOrgForUser(userId);
  if (!org) { next(); return; }

  const sub = await prisma.subscription.findUnique({ where: { organizationId: org.id } });
  const limits = getPlanLimits(sub?.plan ?? "free");

  // Count AI requests today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.usageRecord.count({
    where: { userId, type: "ai_message", createdAt: { gte: startOfDay } },
  });

  if (!isWithinLimit(count, limits.maxAiRequestsPerDay)) {
    res.status(403).json({
      success: false,
      error: `Daily AI request limit reached (${limits.maxAiRequestsPerDay}). Upgrade your plan for more AI interactions.`,
    });
    return;
  }
  next();
}

// ─── Helper ───────────────────────────────────────────────────────────────

async function getOrgForUser(userId: string) {
  const m = await prisma.organizationMember.findFirst({
    where: { userId },
    select: { organizationId: true, organization: { select: { id: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return m?.organization ?? null;
}
