-- Phase 10: SaaS Platform (Subscriptions, Invitations, Audit, API Keys)

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL UNIQUE,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "status" TEXT NOT NULL DEFAULT 'active',
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "subscriptions_organizationId_idx" ON "subscriptions"("organizationId");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'DEVELOPER',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invitedBy" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hashedKey" TEXT NOT NULL UNIQUE,
  "prefix" TEXT NOT NULL,
  "permissions" TEXT[] DEFAULT ARRAY['read'],
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");
CREATE INDEX "api_keys_hashedKey_idx" ON "api_keys"("hashedKey");
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");
