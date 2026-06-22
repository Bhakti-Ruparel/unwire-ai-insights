/**
 * apiKeyService.ts
 *
 * API key management — create, verify, revoke.
 * Keys are stored hashed (SHA-256). Raw key is shown once on creation.
 */

import { randomUUID, createHash } from "crypto";
import { prisma } from "../database/db";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): { raw: string; prefix: string; hashed: string } {
  const raw = `uwk_${randomUUID().replace(/-/g, "")}`;
  const prefix = raw.slice(0, 8);
  const hashed = hashKey(raw);
  return { raw, prefix, hashed };
}

export async function createApiKey(opts: {
  organizationId: string;
  name: string;
  permissions: string[];
  createdBy: string;
  expiresAt?: Date;
}): Promise<{ id: string; rawKey: string; prefix: string }> {
  const { raw, prefix, hashed } = generateKey();

  const key = await prisma.apiKey.create({
    data: {
      organizationId: opts.organizationId,
      name: opts.name,
      hashedKey: hashed,
      prefix,
      permissions: opts.permissions,
      createdBy: opts.createdBy,
      expiresAt: opts.expiresAt,
    },
  });

  return { id: key.id, rawKey: raw, prefix };
}

export async function verifyApiKey(rawKey: string): Promise<{
  valid: boolean;
  organizationId?: string;
  permissions?: string[];
}> {
  const hashed = hashKey(rawKey);
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });

  if (!key || !key.isActive) return { valid: false };
  if (key.expiresAt && new Date() > key.expiresAt) return { valid: false };

  // Update last used
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { valid: true, organizationId: key.organizationId, permissions: key.permissions };
}

export async function listApiKeys(organizationId: string) {
  return prisma.apiKey.findMany({
    where: { organizationId },
    select: {
      id: true, name: true, prefix: true, permissions: true,
      isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(keyId: string, organizationId: string) {
  await prisma.apiKey.updateMany({
    where: { id: keyId, organizationId },
    data: { isActive: false },
  });
}
