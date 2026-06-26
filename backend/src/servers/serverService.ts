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
  agentTokenMasked?: string;
  agentTokenLast6?: string;
  healthScore: number;
  lastSeenAt: string | null;
  lastSeenSecondsAgo: number | null;
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
  cpuCores?: number;
  loadAverage?: number[];
  memoryTotal?: number;
  memoryUsed?: number;
  memoryFree?: number;
  diskTotal?: number;
  diskUsed?: number;
  recordedAt: string;
}

export interface MetricIngestPayload {
  cpuPercent?: number;
  ramPercent?: number;
  diskPercent?: number;
  cpuUsage?: number;
  cpuCores?: number;
  loadAverage?: number[];
  memoryUsage?: number;
  memoryTotal?: number;
  memoryUsed?: number;
  memoryFree?: number;
  diskUsage?: number;
  diskTotal?: number;
  diskUsed?: number;
  networkIn?: number;
  networkOut?: number;
  timestamp?: string;
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

export interface AppIngestPayload {
  name: string;
  type?: string;
  status?: string;
  port?: number | null;
  pid?: number | null;
  uptime?: string;
  memory?: number;
  cpu?: number;
}

export interface LogDTO {
  id: string;
  serverId: string;
  appName: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface LogIngestPayload {
  appName?: string;
  level?: string;
  message: string;
  timestamp?: Date | string;
}

export interface HeartbeatPayload {
  serverId?: string;
  agentVersion?: string;
  timestamp?: string;
  status?: string;
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

export interface AgentTokenDTO {
  agentTokenMasked: string;
  agentTokenLast6: string;
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
      heartbeats: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return servers.map((s) => {
    const latestMetric = s.metrics[0] ? toMetricSnapshot(s.metrics[0]) : null;
    const heartbeat = s.heartbeats[0] ?? null;
    return {
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
      agentTokenMasked: maskToken(s.agentToken),
      agentTokenLast6: tokenLast6(s.agentToken),
      healthScore: computeHealthScore(latestMetric, s.status),
      lastSeenAt: heartbeat?.timestamp.toISOString() ?? null,
      lastSeenSecondsAgo: heartbeat ? Math.floor((Date.now() - heartbeat.timestamp.getTime()) / 1000) : null,
      latestMetric,
    };
  });
}

export async function getServerById(id: string, userId?: string): Promise<ServerDTO | null> {
  const server = await prisma.server.findUnique({
    where: { id },
    include: {
      applications: { select: { id: true } },
      metrics: { orderBy: { recordedAt: "desc" }, take: 1 },
      heartbeats: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });
  if (!server) return null;
  if (userId && server.userId && server.userId !== userId) return null;

  const latestMetric = server.metrics[0] ? toMetricSnapshot(server.metrics[0]) : null;
  const heartbeat = server.heartbeats[0] ?? null;

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
    agentTokenMasked: maskToken(server.agentToken),
    agentTokenLast6: tokenLast6(server.agentToken),
    healthScore: computeHealthScore(latestMetric, server.status),
    lastSeenAt: heartbeat?.timestamp.toISOString() ?? null,
    lastSeenSecondsAgo: heartbeat ? Math.floor((Date.now() - heartbeat.timestamp.getTime()) / 1000) : null,
    appCount: server.applications.length,
    latestMetric,
  };
}

export async function createServer(data: CreateServerDTO): Promise<ServerDTO & { agentToken: string }> {
  const agentToken = randomUUID();
  const server = await prisma.server.create({
    data: {
      id:       randomUUID(),
      name:     data.name,
      host:     data.host,
      provider: data.provider ?? "custom",
      region:   data.region ?? "",
      sshUser:  data.sshUser ?? "root",
      sshPort:  data.sshPort ?? 22,
      agentToken,
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
    agentTokenMasked: maskToken(server.agentToken),
    agentTokenLast6: tokenLast6(server.agentToken),
    healthScore: 0,
    lastSeenAt: null,
    lastSeenSecondsAgo: null,
    appCount: 0, latestMetric: null,
    agentToken, // Return plain token ONLY on creation (shown once)
  };
}

export async function deleteServer(id: string): Promise<void> {
  await prisma.server.delete({ where: { id } });
}

export async function updateServerStatus(id: string, status: string): Promise<void> {
  await prisma.server.update({ where: { id }, data: { status } });
}

export async function recordHeartbeat(serverId: string, payload: HeartbeatPayload, ip: string): Promise<void> {
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  await prisma.serverHeartbeat.create({
    data: {
      id: randomUUID(),
      serverId,
      status: payload.status ?? "online",
      agentVersion: payload.agentVersion ?? "",
      ip,
      timestamp,
    },
  });
  await prisma.server.update({
    where: { id: serverId },
    data: { status: payload.status ?? "online" },
  });

  const old = await prisma.serverHeartbeat.findMany({
    where: { serverId },
    orderBy: { timestamp: "desc" },
    skip: 2880,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.serverHeartbeat.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

export async function regenerateAgentToken(id: string): Promise<AgentTokenDTO> {
  const server = await prisma.server.update({
    where: { id },
    data: { agentToken: randomUUID() },
    select: { agentToken: true },
  });
  return {
    agentTokenMasked: maskToken(server.agentToken),
    agentTokenLast6: tokenLast6(server.agentToken),
  };
}

// ─── Metrics ───────────────────────────────────────────────────────────────

export async function saveMetric(
  serverId: string,
  metric: MetricIngestPayload
): Promise<void> {
  const cpuPercent = metric.cpuPercent ?? metric.cpuUsage ?? 0;
  const ramPercent = metric.ramPercent ?? metric.memoryUsage ?? percentage(metric.memoryUsed, metric.memoryTotal);
  const diskPercent = metric.diskPercent ?? metric.diskUsage ?? percentage(metric.diskUsed, metric.diskTotal);
  await prisma.serverMetric.create({
    data: {
      id: randomUUID(),
      serverId,
      cpuPercent,
      ramPercent,
      diskPercent,
      networkIn: metric.networkIn ?? 0,
      networkOut: metric.networkOut ?? 0,
      cpuUsage: cpuPercent,
      cpuCores: metric.cpuCores ?? 0,
      loadAverage: metric.loadAverage ?? [],
      memoryTotal: metric.memoryTotal ?? 0,
      memoryUsed: metric.memoryUsed ?? 0,
      memoryFree: metric.memoryFree ?? 0,
      diskTotal: metric.diskTotal ?? 0,
      diskUsed: metric.diskUsed ?? 0,
      recordedAt: metric.timestamp ? new Date(metric.timestamp) : new Date(),
    },
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
  limit = 60,
  range: "1m" | "1h" | "24h" | "7d" = "1h"
): Promise<MetricSnapshot[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 500);
  const rows = await prisma.serverMetric.findMany({
    where: { serverId, recordedAt: { gte: rangeStart(range) } },
    orderBy: { recordedAt: "desc" },
    take: cappedLimit,
  });
  return rows.reverse().map(toMetricSnapshot);
}

export async function getMetricsWithPagination(
  serverId: string,
  opts: { page?: number; limit?: number; range?: "1m" | "1h" | "24h" | "7d" } = {}
): Promise<{
  metrics: MetricSnapshot[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const pageNum = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.limit ?? 100), 500);
  const range = opts.range ?? "24h";

  const where = { serverId, recordedAt: { gte: rangeStart(range) } };
  const [metrics, total] = await Promise.all([
    prisma.serverMetric.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.serverMetric.count({ where }),
  ]);

  return {
    metrics: metrics.reverse().map(toMetricSnapshot),
    total,
    page: pageNum,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
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

export async function replaceApps(serverId: string, apps: AppIngestPayload[]): Promise<void> {
  const seen = new Set<string>();
  for (const app of apps.slice(0, 200)) {
    if (!app.name) continue;
    seen.add(app.name);
    await upsertApp(serverId, {
      name: app.name,
      type: app.type ?? "process",
      status: app.status ?? "running",
      port: app.port ?? null,
      pid: app.pid ?? null,
      uptime: app.uptime ?? "",
      memory: app.memory ?? 0,
      cpu: app.cpu ?? 0,
      lastAction: "",
    });
  }

  if (seen.size > 0) {
    await prisma.serverApp.updateMany({
      where: { serverId, name: { notIn: Array.from(seen) } },
      data: { status: "stopped", updatedAt: new Date() },
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

export async function getServerLogsWithPagination(
  serverId: string,
  opts: {
    page?: number;
    limit?: number;
    appName?: string;
    level?: string;
    range?: "1h" | "24h" | "7d";
  } = {}
): Promise<{
  logs: LogDTO[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}> {
  const pageNum = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(Math.max(1, opts.limit ?? 50), 500);
  const range = opts.range ?? "24h";

  const where = {
    serverId,
    ...(opts.appName ? { appName: opts.appName } : {}),
    ...(opts.level ? { level: opts.level } : {}),
    timestamp: { gte: rangeStart(range) },
  };

  const [logs, total] = await Promise.all([
    prisma.serverLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.serverLog.count({ where }),
  ]);

  return {
    logs: logs.map((r) => ({
      id: r.id,
      serverId: r.serverId,
      appName: r.appName,
      level: r.level,
      message: r.message,
      timestamp: r.timestamp.toISOString(),
    })),
    total,
    page: pageNum,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

export async function appendLogs(
  serverId: string,
  logs: LogIngestPayload[]
): Promise<void> {
  if (logs.length === 0) return;
  const normalized = logs.slice(0, 500).filter((l) => l.message?.trim());
  await prisma.serverLog.createMany({
    data: normalized.map((l) => ({
      id: randomUUID(), serverId,
      appName: l.appName ?? "", level: normalizeLogLevel(l.level),
      message: l.message,
      timestamp: normalizeTimestamp(l.timestamp),
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

function tokenLast6(token: string | null | undefined): string {
  return token?.slice(-6) ?? "";
}

function maskToken(token: string | null | undefined): string {
  const last6 = tokenLast6(token);
  return last6 ? `******${last6}` : "";
}

function toMetricSnapshot(r: {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  networkIn: number;
  networkOut: number;
  recordedAt: Date;
  cpuCores?: number;
  loadAverage?: number[];
  memoryTotal?: number;
  memoryUsed?: number;
  memoryFree?: number;
  diskTotal?: number;
  diskUsed?: number;
}): MetricSnapshot {
  return {
    cpuPercent: r.cpuPercent,
    ramPercent: r.ramPercent,
    diskPercent: r.diskPercent,
    networkIn: r.networkIn,
    networkOut: r.networkOut,
    cpuCores: r.cpuCores,
    loadAverage: r.loadAverage,
    memoryTotal: r.memoryTotal,
    memoryUsed: r.memoryUsed,
    memoryFree: r.memoryFree,
    diskTotal: r.diskTotal,
    diskUsed: r.diskUsed,
    recordedAt: r.recordedAt.toISOString(),
  };
}

function percentage(used?: number, total?: number): number {
  if (!used || !total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function rangeStart(range: "1m" | "1h" | "24h" | "7d"): Date {
  const ms = range === "1m" ? 60_000 : range === "1h" ? 3_600_000 : range === "24h" ? 86_400_000 : 604_800_000;
  return new Date(Date.now() - ms);
}

function computeHealthScore(metric: MetricSnapshot | null, status: string): number {
  if (status === "offline") return 0;
  if (!metric) return status === "online" ? 75 : 40;
  const pressure = Math.max(metric.cpuPercent, metric.ramPercent, metric.diskPercent);
  const base = status === "online" ? 100 : 70;
  return Math.max(0, Math.min(100, Math.round(base - pressure * 0.45)));
}

function normalizeLogLevel(level?: string): string {
  const value = (level ?? "info").toLowerCase();
  if (["info", "warn", "error", "debug"].includes(value)) return value;
  if (value === "warning") return "warn";
  return "info";
}

function normalizeTimestamp(timestamp?: Date | string): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
