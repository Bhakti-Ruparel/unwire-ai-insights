-- Multi-Cloud Infrastructure Integration

CREATE TABLE IF NOT EXISTS "infra_connections" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "region" TEXT NOT NULL DEFAULT '',
  "encryptedCreds" TEXT NOT NULL DEFAULT '',
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "infra_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "infra_connections_organizationId_idx" ON "infra_connections"("organizationId");
CREATE INDEX "infra_connections_provider_idx" ON "infra_connections"("provider");

CREATE TABLE IF NOT EXISTS "cloud_resources" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "specs" JSONB NOT NULL DEFAULT '{}',
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cloud_resources_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "infra_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "cloud_resources_connectionId_resourceId_key" UNIQUE ("connectionId", "resourceId")
);

CREATE INDEX "cloud_resources_connectionId_idx" ON "cloud_resources"("connectionId");
CREATE INDEX "cloud_resources_provider_resourceType_idx" ON "cloud_resources"("provider", "resourceType");
CREATE INDEX "cloud_resources_status_idx" ON "cloud_resources"("status");
