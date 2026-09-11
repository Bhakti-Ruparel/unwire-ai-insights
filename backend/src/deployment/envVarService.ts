/**
 * envVarService.ts
 *
 * Secure environment variable management for deployments.
 * Variables are encrypted at rest using the infrastructure credential vault.
 * Scoped to organization + project.
 *
 * Flow:
 *   1. User sets env vars via UI (per project)
 *   2. Stored encrypted in database
 *   3. Deployment pipeline retrieves and decrypts at deploy time
 *   4. Written to .env file on target server (via agent)
 */

import { prisma } from "../database/db";
import { encryptCredentials, decryptCredentials } from "../infrastructure/credentialVault";
import { recordAudit } from "../billing/auditService";

export interface EnvVarEntry {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EnvVarDisplay {
  key: string;
  value: string;       // Masked if isSecret
  isSecret: boolean;
  updatedAt: string;
}

// ─── Get env vars for a project (masked secrets) ──────────────────────────

export async function getProjectEnvVars(projectId: string): Promise<EnvVarDisplay[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, description: true },
  });
  if (!project) return [];

  // Env vars stored in project description field as encrypted JSON
  // (Using existing schema — avoids new migration)
  const raw = await getStoredVars(projectId);
  return raw.map((v) => ({
    key: v.key,
    value: v.isSecret ? "••••••••" : v.value,
    isSecret: v.isSecret,
    updatedAt: new Date().toISOString(),
  }));
}

// ─── Get decrypted env vars (for deployment pipeline only) ────────────────

export async function getDecryptedEnvVars(projectId: string): Promise<Record<string, string>> {
  const vars = await getStoredVars(projectId);
  const result: Record<string, string> = {};
  for (const v of vars) {
    result[v.key] = v.value;
  }
  return result;
}

// ─── Set env vars for a project ───────────────────────────────────────────

export async function setProjectEnvVars(
  projectId: string,
  vars: EnvVarEntry[],
  userId: string,
  organizationId?: string
): Promise<void> {
  // Encrypt and store
  const encrypted = encryptCredentials(vars as any);

  // Store in a dedicated metadata field (using Prisma Json)
  // We use a dedicated record in usage_records with type "env_vars"
  await prisma.usageRecord.upsert({
    where: { id: `envvars:${projectId}` },
    create: {
      id: `envvars:${projectId}`,
      userId,
      type: "env_vars",
      metadata: { projectId, encrypted } as any,
    },
    update: {
      metadata: { projectId, encrypted } as any,
    },
  });

  recordAudit({
    organizationId,
    userId,
    action: "env_vars.updated",
    resource: `project:${projectId}`,
    metadata: { keyCount: vars.length, keys: vars.map(v => v.key) },
  });
}

// ─── Delete a specific env var ────────────────────────────────────────────

export async function deleteProjectEnvVar(
  projectId: string,
  key: string,
  userId: string
): Promise<void> {
  const vars = await getStoredVars(projectId);
  const filtered = vars.filter(v => v.key !== key);
  await setProjectEnvVars(projectId, filtered, userId);
}

// ─── Internal: get/decrypt stored vars ────────────────────────────────────

async function getStoredVars(projectId: string): Promise<EnvVarEntry[]> {
  const record = await prisma.usageRecord.findUnique({
    where: { id: `envvars:${projectId}` },
  });

  if (!record) return [];

  const metadata = record.metadata as any;
  if (!metadata?.encrypted) return [];

  try {
    const decrypted = decryptCredentials(metadata.encrypted);
    return Array.isArray(decrypted) ? decrypted : [];
  } catch {
    return [];
  }
}
