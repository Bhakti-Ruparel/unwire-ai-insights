/**
 * infraService.ts
 *
 * Infrastructure management service.
 * Handles connections, syncing, and resource queries.
 */

import { prisma } from "../database/db";
import { encryptCredentials, decryptCredentials } from "./credentialVault";
import { getProvider, getAllProviders, type ProviderType, type ProviderCredentials } from "./providerInterface";
import { recordAudit } from "../billing/auditService";
import { logger } from "../services/logger";

// Register all providers (side-effect imports)
import "./providers/awsProvider";
import "./providers/digitaloceanProvider";
import "./providers/dockerProvider";
import "./providers/azureProvider";
import "./providers/gcpProvider";
import "./providers/hetznerProvider";

// ─── List available providers ─────────────────────────────────────────────

export function listProviders() {
  return getAllProviders().map((p) => ({
    type: p.type,
    displayName: p.displayName,
    fields: p.getRequiredCredentialFields(),
  }));
}

// ─── Connect a provider ───────────────────────────────────────────────────

export async function connectProvider(opts: {
  organizationId: string;
  userId: string;
  provider: ProviderType;
  name: string;
  credentials: ProviderCredentials;
}): Promise<{ id: string } | { error: string }> {
  const providerImpl = getProvider(opts.provider);
  if (!providerImpl) return { error: `Provider "${opts.provider}" is not supported.` };

  // Validate credentials
  const validation = await providerImpl.validateCredentials(opts.credentials);
  if (!validation.valid) return { error: validation.error ?? "Invalid credentials." };

  // Encrypt and store
  const encrypted = encryptCredentials(opts.credentials);
  const connection = await prisma.infraConnection.create({
    data: {
      organizationId: opts.organizationId,
      provider: opts.provider,
      name: opts.name,
      status: "connected",
      region: validation.region ?? opts.credentials.region ?? "",
      encryptedCreds: encrypted,
      createdBy: opts.userId,
      metadata: { accountId: validation.accountId } as any,
    },
  });

  recordAudit({
    organizationId: opts.organizationId,
    userId: opts.userId,
    action: "infra.connected",
    resource: `connection:${connection.id}`,
    metadata: { provider: opts.provider, name: opts.name },
  });

  // Trigger initial sync (non-blocking)
  syncConnection(connection.id).catch((err) => {
    logger.warn(`Initial sync failed for ${connection.id}: ${err.message}`);
  });

  return { id: connection.id };
}

// ─── Disconnect ───────────────────────────────────────────────────────────

export async function disconnectProvider(connectionId: string, organizationId: string, userId: string): Promise<void> {
  await prisma.infraConnection.updateMany({
    where: { id: connectionId, organizationId },
    data: { status: "disconnected", encryptedCreds: "" },
  });
  // Remove discovered resources
  await prisma.cloudResource.deleteMany({ where: { connectionId } });
  recordAudit({ organizationId, userId, action: "infra.disconnected", resource: `connection:${connectionId}` });
}

// ─── List connections for an organization ─────────────────────────────────

export async function listConnections(organizationId: string) {
  const connections = await prisma.infraConnection.findMany({
    where: { organizationId },
    select: {
      id: true, provider: true, name: true, status: true, region: true,
      lastSyncAt: true, lastError: true, metadata: true, createdAt: true,
      _count: { select: { resources: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return connections.map((c) => ({
    id: c.id, provider: c.provider, name: c.name, status: c.status,
    region: c.region, lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastError: c.lastError, resourceCount: c._count.resources,
    metadata: c.metadata, createdAt: c.createdAt.toISOString(),
  }));
}

// ─── List resources ───────────────────────────────────────────────────────

export async function listResources(organizationId: string, opts: {
  provider?: string; resourceType?: string; status?: string;
  connectionId?: string; limit?: number; cursor?: string;
} = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);

  // Get all connection IDs for this org
  const connectionIds = await prisma.infraConnection.findMany({
    where: { organizationId, ...(opts.connectionId ? { id: opts.connectionId } : {}) },
    select: { id: true },
  });
  const ids = connectionIds.map((c) => c.id);
  if (ids.length === 0) return { resources: [], nextCursor: null };

  const where: any = { connectionId: { in: ids } };
  if (opts.provider) where.provider = opts.provider;
  if (opts.resourceType) where.resourceType = opts.resourceType;
  if (opts.status) where.status = opts.status;
  if (opts.cursor) where.createdAt = { lt: new Date(opts.cursor) };

  const resources = await prisma.cloudResource.findMany({
    where, orderBy: { lastSeenAt: "desc" }, take: limit + 1,
    select: {
      id: true, provider: true, resourceType: true, resourceId: true,
      name: true, region: true, status: true, specs: true, metrics: true,
      tags: true, lastSeenAt: true, connection: { select: { name: true } },
    },
  });

  const hasMore = resources.length > limit;
  const data = hasMore ? resources.slice(0, limit) : resources;
  return {
    resources: data.map((r) => ({
      ...r, connectionName: r.connection.name,
      lastSeenAt: r.lastSeenAt.toISOString(),
    })),
    nextCursor: hasMore ? data[data.length - 1].lastSeenAt.toISOString() : null,
  };
}

// ─── Sync a single connection ─────────────────────────────────────────────

export async function syncConnection(connectionId: string): Promise<{ count: number } | { error: string }> {
  const conn = await prisma.infraConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.status === "disconnected") return { error: "Connection not found or disconnected." };

  const providerImpl = getProvider(conn.provider as ProviderType);
  if (!providerImpl) return { error: `Provider "${conn.provider}" not available.` };

  let creds: ProviderCredentials;
  try {
    creds = decryptCredentials(conn.encryptedCreds);
  } catch {
    await prisma.infraConnection.update({ where: { id: connectionId }, data: { status: "error", lastError: "Failed to decrypt credentials." } });
    return { error: "Credential decryption failed." };
  }

  try {
    const discovered = await providerImpl.discoverResources(creds, conn.region || undefined);

    // Upsert resources
    for (const res of discovered) {
      await prisma.cloudResource.upsert({
        where: { connectionId_resourceId: { connectionId, resourceId: res.resourceId } },
        create: {
          connectionId, provider: conn.provider,
          resourceType: res.resourceType, resourceId: res.resourceId,
          name: res.name, region: res.region, status: res.status,
          specs: res.specs as any, metrics: (res.metrics ?? {}) as any,
          tags: (Object.entries(res.tags).map(([k, v]) => ({ key: k, value: v }))) as any,
          lastSeenAt: new Date(),
        },
        update: {
          name: res.name, region: res.region, status: res.status,
          specs: res.specs as any, metrics: (res.metrics ?? {}) as any,
          tags: (Object.entries(res.tags).map(([k, v]) => ({ key: k, value: v }))) as any,
          lastSeenAt: new Date(), updatedAt: new Date(),
        },
      });
    }

    // Mark resources not seen in this sync as terminated
    const discoveredIds = discovered.map((r) => r.resourceId);
    if (discoveredIds.length > 0) {
      await prisma.cloudResource.updateMany({
        where: { connectionId, resourceId: { notIn: discoveredIds }, status: { not: "terminated" } },
        data: { status: "terminated", updatedAt: new Date() },
      });
    }

    // Update connection status
    await prisma.infraConnection.update({
      where: { id: connectionId },
      data: { status: "connected", lastSyncAt: new Date(), lastError: null },
    });

    logger.info(`Infra sync complete: ${conn.provider}/${conn.name} — ${discovered.length} resources`);
    return { count: discovered.length };
  } catch (err: any) {
    await prisma.infraConnection.update({
      where: { id: connectionId },
      data: { status: "error", lastError: err.message?.slice(0, 500) },
    });
    return { error: err.message ?? "Sync failed." };
  }
}

// ─── Get infrastructure summary for an org ────────────────────────────────

export async function getInfraSummary(organizationId: string) {
  const [connections, resourceCounts] = await Promise.all([
    prisma.infraConnection.findMany({
      where: { organizationId, status: { not: "disconnected" } },
      select: { id: true, provider: true, name: true, status: true },
    }),
    prisma.cloudResource.groupBy({
      by: ["provider", "status"],
      where: { connection: { organizationId } },
      _count: { _all: true },
    }),
  ]);

  const byProvider: Record<string, { total: number; running: number; stopped: number }> = {};
  for (const g of resourceCounts) {
    if (!byProvider[g.provider]) byProvider[g.provider] = { total: 0, running: 0, stopped: 0 };
    byProvider[g.provider].total += g._count._all;
    if (g.status === "running") byProvider[g.provider].running += g._count._all;
    if (g.status === "stopped") byProvider[g.provider].stopped += g._count._all;
  }

  return { connections: connections.length, providers: byProvider };
}
