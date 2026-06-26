/**
 * organizationContext.ts
 *
 * Multi-tenant organization context middleware.
 * Resolves the active organization from:
 *   1. X-Organization-Id header (explicit switching)
 *   2. User's default organization (first joined)
 *
 * Attaches req.org with { id, role } to all downstream handlers.
 * Verifies the user belongs to the organization.
 *
 * Usage:
 *   router.use(authenticate, withOrgContext);
 *   router.post("/", requireRole("ADMIN"), ctrl.create);
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OrgContext {
  id: string;
  name: string;
  plan: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

declare global {
  namespace Express {
    interface Request {
      org?: OrgContext;
    }
  }
}

// ─── Resolve organization context ─────────────────────────────────────────

/**
 * withOrgContext — resolves organization and attaches to req.org.
 * Requires `authenticate` to have run first (req.user must exist).
 */
export async function withOrgContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  // 1. Check X-Organization-Id header for explicit org selection
  const headerOrgId = req.headers["x-organization-id"] as string | undefined;

  let membership: { organizationId: string; role: string; organization: { id: string; name: string; plan: string } } | null = null;

  if (headerOrgId) {
    // Verify user belongs to this specific org
    membership = await prisma.organizationMember.findFirst({
      where: { userId, organizationId: headerOrgId },
      select: {
        organizationId: true,
        role: true,
        organization: { select: { id: true, name: true, plan: true } },
      },
    });

    if (!membership) {
      res.status(403).json({ success: false, error: "You do not have access to this organization." });
      return;
    }
  } else {
    // 2. Default to user's primary organization (first joined)
    membership = await prisma.organizationMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: {
        organizationId: true,
        role: true,
        organization: { select: { id: true, name: true, plan: true } },
      },
    });
  }

  if (!membership) {
    // User has no organization — allow request but with no org context
    next();
    return;
  }

  req.org = {
    id: membership.organization.id,
    name: membership.organization.name,
    plan: membership.organization.plan,
    role: membership.role as OrgContext["role"],
  };

  next();
}

// ─── Role-based access control ────────────────────────────────────────────

/**
 * requireRole — factory that creates middleware enforcing minimum role.
 * Must run AFTER withOrgContext.
 *
 * Role hierarchy: OWNER > ADMIN > MEMBER
 */
export function requireRole(...allowedRoles: Array<"OWNER" | "ADMIN" | "MEMBER">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.org) {
      res.status(403).json({ success: false, error: "Organization context required." });
      return;
    }

    if (!allowedRoles.includes(req.org.role)) {
      res.status(403).json({
        success: false,
        error: `This action requires ${allowedRoles.join(" or ")} role. Your role: ${req.org.role}.`,
      });
      return;
    }

    next();
  };
}

/**
 * requireOrgOwner — shortcut for OWNER-only actions (billing, delete org).
 */
export function requireOrgOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.org || req.org.role !== "OWNER") {
    res.status(403).json({ success: false, error: "Only the organization owner can perform this action." });
    return;
  }
  next();
}

/**
 * requireOrgAdmin — shortcut for ADMIN+ actions (manage members, deploy).
 */
export function requireOrgAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.org || !["OWNER", "ADMIN"].includes(req.org.role)) {
    res.status(403).json({ success: false, error: "Admin or owner role required." });
    return;
  }
  next();
}
