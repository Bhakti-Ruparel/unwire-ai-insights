/**
 * adminService.ts
 *
 * All admin dashboard queries — paginated, indexed, never loads everything at once.
 */

import { prisma } from "../database/db";

// ─── Overview stats ────────────────────────────────────────────────────────

export async function getSystemOverview() {
  const [
    totalUsers, totalProjects, totalServers,
    activeUsers30d, aiMessages, uploads,
    totalDeployments, failedDeployments, runningDeployments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.server.count(),
    prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    prisma.usageRecord.count({ where: { type: "ai_message" } }),
    prisma.usageRecord.count({ where: { type: "upload" } }),
    prisma.deployment.count(),
    prisma.deployment.count({ where: { status: "FAILED" } }),
    prisma.deployment.count({ where: { status: "RUNNING" } }),
  ]);

  // Avg deployment duration
  const durations = await prisma.deployment.findMany({
    where:   { status: "SUCCESS", startedAt: { not: null }, completedAt: { not: null } },
    select:  { startedAt: true, completedAt: true },
    take:    50,
    orderBy: { createdAt: "desc" },
  });
  let avgDeploymentMs = 0;
  if (durations.length > 0) {
    const sum = durations.reduce((a, d) => a + (d.completedAt!.getTime() - d.startedAt!.getTime()), 0);
    avgDeploymentMs = Math.floor(sum / durations.length);
  }

  // DB health check
  let dbStatus = "ok";
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbStatus = "error"; }

  return {
    totalUsers, totalProjects, totalServers, activeUsers30d,
    aiMessages, uploads,
    deployments: { total: totalDeployments, failed: failedDeployments, running: runningDeployments, avgDeploymentMs },
    system: { dbStatus, queueStatus: "ok", aiStatus: process.env.OPENAI_API_KEY ? "configured" : "not_configured" },
  };
}

// ─── Users list (paginated) ────────────────────────────────────────────────

export async function listUsers(opts: { page: number; limit: number; search?: string; role?: string }) {
  const { page, limit, search, role } = opts;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where.OR = [
      { name:  { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, createdAt: true, updatedAt: true,
        _count: { select: { projects: true, servers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    pages: Math.ceil(total / limit),
    users: users.map((u) => ({
      id:           u.id,
      name:         u.name,
      email:        u.email,
      role:         u.role,
      isActive:     u.isActive,
      projectCount: u._count.projects,
      serverCount:  u._count.servers,
      createdAt:    u.createdAt.toISOString(),
      lastActive:   u.updatedAt.toISOString(),
    })),
  };
}

// ─── User detail ──────────────────────────────────────────────────────────

export async function getUserDetail(userId: string) {
  const [user, projects, servers, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { orgMemberships: { include: { organization: true } } },
    }),
    prisma.project.findMany({
      where: { userId },
      select: { id: true, name: true, status: true, stack: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.server.findMany({
      where: { userId },
      select: { id: true, name: true, host: true, status: true, provider: true },
      take: 10,
    }),
    prisma.usageRecord.groupBy({
      by: ["type"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  if (!user) return null;

  return {
    id: user.id, name: user.name, email: user.email,
    role: user.role, isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    organizations: user.orgMemberships.map((m) => ({
      id: m.organization.id, name: m.organization.name,
      plan: m.organization.plan, role: m.role,
    })),
    projects: projects.map((p) => ({
      id: p.id, name: p.name, status: p.status,
      stack: p.stack, createdAt: p.createdAt.toISOString(),
    })),
    servers: servers.map((s) => ({
      id: s.id, name: s.name, host: s.host,
      status: s.status, provider: s.provider,
    })),
    usage: Object.fromEntries(usage.map((u) => [u.type, u._count._all])),
  };
}

// ─── Admin actions ────────────────────────────────────────────────────────

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  if (!isActive) {
    // Invalidate all sessions
    await prisma.session.deleteMany({ where: { userId } });
  }
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN"): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role } });
}

export async function deleteUserAccount(userId: string): Promise<void> {
  // Cascade deletes handle related data
  await prisma.user.delete({ where: { id: userId } });
}

// ─── Usage analytics ──────────────────────────────────────────────────────

export async function getUsageStats(days = 30) {
  const since = new Date(Date.now() - days * 86400000);

  const [byType, dailyAI] = await Promise.all([
    prisma.usageRecord.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt")::text as date, COUNT(*) as count
      FROM usage_records
      WHERE type = 'ai_message' AND "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return {
    byType: Object.fromEntries(byType.map((u) => [u.type, u._count._all])),
    dailyAI: dailyAI.map((r) => ({ date: r.date, count: Number(r.count) })),
  };
}
