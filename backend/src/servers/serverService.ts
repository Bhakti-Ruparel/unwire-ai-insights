/**
 * serverService.ts
 *
 * Database CRUD + business logic for server management.
 * All SSH/agent operations are handled by serverAgent.ts.
 * This service only manages the DB records.
 */

import { randomUUID } from "crypto";
import { prisma } from "../database/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateServerDTO {
  name: string;
  host: string;
  provider?: string;
  region?: string;
  sshUser?: string;
  sshPort?: number;
  userId?: string;
}

export interface ServerDTO {
  id: string;
  name: string;
  host: string;
  provider: string;
  region: string;
  status: string;
  sshUser: string;
  sshPort: number;
  createdAt: string;
  updatedAt: string;
  // Aggregated
  appCount: number;
  latestMetric?: MetricSnapshot | null;
}

export interface MetricSnapshot {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  networkIn: number;
  networkOut: number;
  recordedAt: string;
}

export interface AppDTO {
  id: string;
  serverId: string;
  name: string;
  type: string;
  status: string;
  port: number | null;
  pid: number | null;
  uptime: string;
  memory: number;
  cpu: number;
  lastAction: string;
}

export interface LogDTO {
  id: string;
  serverId: string;
  appName: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface DomainDTO {
  id: string;
  serverId: string;
  domain: string;
  type: string;
  target: string;
  status: string;
  createdAt: string;
}

export interface SslCertDTO {
  id: string;
  serverId: string;
  domain: string;
  provider: string;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  daysUntilExpiry: number | null;
}

// ─── Servers CRUD ──────────────────────────────────────────────────────────

export async function getAllServers(userId?: string): Promise<ServerDTO[]> {
  const where = userId ? { userId } : {};
  const servers = await prisma.server.findMany({
    where,
    include: {
      applications: { select: { id: true } },
      metrics: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    host: s.host,
    provider: s.provider,
    region: s.region,
    status: s.status,
    sshUser: s.sshUser,
    sshPort: s.sshPort,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    appCount: s.applications.length,
    latestMetric: s.metrics[0]
      ? {
          cpuPercent:  s.metrics[0].cpuPercent,
          ramPercent:  s.metrics[0].ramPercent,
          diskPercent: s.metrics[0].diskPercent,
          networkIn:   s.metrics[0].networkIn,
          networkOut:  s.metrics[0].networkOut,
          recordedAt:  s.metrics[0].recordedAt.toISOString(),
        }
      : null,
  }));
}

export async function getServerById(id: string, userId?: string): Promise<ServerDTO | null> {
  const server = await prisma.server.findUnique({
    where: { id },
    include: {
      applications: { select: { id: true } },
      metrics: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
  });
  if (!server) return null;
  if (userId && server.userId && server.userId !== userId) return null;

  return {
    id: server.id,
    name: server.name,
    host: server.host,
    provider: server.provider,
    region: server.region,
    status: server.status,
    sshUser: server.sshUser,
    sshPort: server.sshPort,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    appCount: server.applications.length,
    latestMetric: server.metrics[0]
      ? {
          cpuPercent:  server.metrics[0].cpuPercent,
          ramPercent:  server.metrics[0].ramPercent,
          diskPercent: server.metrics[0].diskPercent,
          networkIn:   server.metrics[0].networkIn,
          networkOut:  server.metrics[0].networkOut,
          recordedAt:  server.metrics[0].recordedAt.toISOString(),
        }
      : null,
  };
}

export async function createServer(data: CreateServerDTO): Promise<ServerDTO> {
  const server = await prisma.server.create({
    data: {
      id:       randomUUID(),
      name:     data.name,
      host:     data.host,
      provider: data.provider ?? "custom",
      region:   data.region ?? "",
      sshUser:  data.sshUser ?? "root",
      sshPort:  data.sshPort ?? 22,
      userId:   data.userId ?? null,
      status:   "unknown",
    },
    include: {
      applications: { select: { id: true } },
      metrics:      { orderBy: { recordedAt: "desc" }, take: 1 },
    },
  });

  return {
    id: server.id, name: server.name, host: server.host,
    provider: server.provider, region: server.region,
    status: server.status, sshUser: server.sshUser, sshPort: server.sshPort,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    appCount: 0, latestMetric: null,
  };
}

export async function deleteServer(id: string): Promise<void> {
  await prisma.server.delete({ where: { id } });
}

export async function updateServerStatus(id: string, status: string): Promise<void> {
  await prisma.server.update({ where: { id }, data: { status } });
}

// ─── Metrics ───────────────────────────────────────────────────────────────

export async function saveMetric(
  serverId: string,
  metric: Omit<MetricSnapshot, "recordedAt">
): Promise<void> {
  await prisma.serverMetric.create({
    data: { id: randomUUID(), serverId, ...metric },
  });
  // Prune old metrics — keep last 288 records (~24h at 5min intervals)
  const old = await prisma.serverMetric.findMany({
    where: { serverId },
    orderBy: { recordedAt: "desc" },
    skip: 288,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.serverMetric.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

export async function getMetricHistory(
  serverId: string,
  limit = 60
): Promise<MetricSnapshot[]> {
  const rows = await prisma.serverMetric.findMany({
    where: { serverId },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
  return rows.reverse().map((r) => ({
    cpuPercent: r.cpuPercent, ramPercent: r.ramPercent,
    diskPercent: r.diskPercent, networkIn: r.networkIn,
    networkOut: r.networkOut, recordedAt: r.recordedAt.toISOString(),
  }));
}

// ─── Applications ──────────────────────────────────────────────────────────

export async function getServerApps(serverId: string): Promise<AppDTO[]> {
  const rows = await prisma.serverApp.findMany({ where: { serverId } });
  return rows.map((r) => ({
    id: r.id, serverId: r.serverId, name: r.name, type: r.type,
    status: r.status, port: r.port, pid: r.pid,
    uptime: r.uptime, memory: r.memory, cpu: r.cpu,
    lastAction: r.lastAction,
  }));
}

export async function upsertApp(
  serverId: string,
  app: Omit<AppDTO, "id" | "serverId">
): Promise<void> {
  const existing = await prisma.serverApp.findFirst({
    where: { serverId, name: app.name },
  });
  if (existing) {
    await prisma.serverApp.update({
      where: { id: existing.id },
      data: { ...app, updatedAt: new Date() },
    });
  } else {
    await prisma.serverApp.create({
      data: { id: randomUUID(), serverId, ...app },
    });
  }
}

export async function updateAppStatus(
  serverId: string,
  appName: string,
  status: string,
  action: string
): Promise<void> {
  await prisma.serverApp.updateMany({
    where: { serverId, name: appName },
    data: { status, lastAction: action, updatedAt: new Date() },
  });
}

// ─── Logs ──────────────────────────────────────────────────────────────────

export async function getServerLogs(
  serverId: string,
  opts: { appName?: string; level?: string; limit?: number; before?: Date }
): Promise<LogDTO[]> {
  const rows = await prisma.serverLog.findMany({
    where: {
      serverId,
      ...(opts.appName ? { appName: opts.appName } : {}),
      ...(opts.level   ? { level: opts.level }     : {}),
      ...(opts.before  ? { timestamp: { lt: opts.before } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: opts.limit ?? 100,
  });
  return rows.map((r) => ({
    id: r.id, serverId: r.serverId, appName: r.appName,
    level: r.level, message: r.message,
    timestamp: r.timestamp.toISOString(),
  }));
}

export async function appendLogs(
  serverId: string,
  logs: Array<{ appName: string; level: string; message: string; timestamp?: Date }>
): Promise<void> {
  if (logs.length === 0) return;
  await prisma.serverLog.createMany({
    data: logs.map((l) => ({
      id: randomUUID(), serverId,
      appName: l.appName, level: l.level,
      message: l.message,
      timestamp: l.timestamp ?? new Date(),
    })),
  });
  // Keep last 10,000 logs per server
  const old = await prisma.serverLog.findMany({
    where: { serverId },
    orderBy: { timestamp: "desc" },
    skip: 10000, select: { id: true },
  });
  if (old.length > 0) {
    await prisma.serverLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

// ─── Domains ───────────────────────────────────────────────────────────────

export async function getServerDomains(serverId: string): Promise<DomainDTO[]> {
  const rows = await prisma.serverDomain.findMany({ where: { serverId } });
  return rows.map((r) => ({
    id: r.id, serverId: r.serverId, domain: r.domain,
    type: r.type, target: r.target, status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addDomain(
  serverId: string,
  data: { domain: string; type: string; target: string }
): Promise<DomainDTO> {
  const row = await prisma.serverDomain.create({
    data: { id: randomUUID(), serverId, ...data },
  });
  return {
    id: row.id, serverId: row.serverId, domain: row.domain,
    type: row.type, target: row.target, status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteDomain(id: string): Promise<void> {
  await prisma.serverDomain.delete({ where: { id } });
}

// ─── SSL Certs ─────────────────────────────────────────────────────────────

export async function getServerSslCerts(serverId: string): Promise<SslCertDTO[]> {
  const rows = await prisma.sslCert.findMany({ where: { serverId } });
  return rows.map((r) => {
    const daysUntilExpiry = r.expiresAt
      ? Math.floor((r.expiresAt.getTime() - Date.now()) / 86400000)
      : null;
    return {
      id: r.id, serverId: r.serverId, domain: r.domain,
      provider: r.provider, status: r.status,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      autoRenew: r.autoRenew, daysUntilExpiry,
    };
  });
}

export async function addSslCert(
  serverId: string,
  data: { domain: string; provider?: string; expiresAt?: Date; autoRenew?: boolean }
): Promise<SslCertDTO> {
  const row = await prisma.sslCert.create({
    data: {
      id: randomUUID(), serverId,
      domain: data.domain,
      provider: data.provider ?? "letsencrypt",
      status: "pending",
      expiresAt: data.expiresAt ?? null,
      autoRenew: data.autoRenew ?? true,
    },
  });
  return {
    id: row.id, serverId: row.serverId, domain: row.domain,
    provider: row.provider, status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    autoRenew: row.autoRenew, daysUntilExpiry: null,
  };
}
