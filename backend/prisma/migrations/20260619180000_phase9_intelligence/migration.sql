-- Phase 9: Autonomous DevOps Intelligence Layer
-- Alerts, Incidents, Notifications

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "serverId" TEXT,
  "projectId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'WARNING',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "alerts_userId_status_idx" ON "alerts"("userId", "status");
CREATE INDEX "alerts_userId_createdAt_idx" ON "alerts"("userId", "createdAt");
CREATE INDEX "alerts_serverId_createdAt_idx" ON "alerts"("serverId", "createdAt");
CREATE INDEX "alerts_severity_status_idx" ON "alerts"("severity", "status");

CREATE TABLE IF NOT EXISTS "incidents" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "serverId" TEXT,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'WARNING',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "rootCause" TEXT,
  "resolution" TEXT,
  "aiAnalysis" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "incidents_userId_status_idx" ON "incidents"("userId", "status");
CREATE INDEX "incidents_userId_createdAt_idx" ON "incidents"("userId", "createdAt");
CREATE INDEX "incidents_serverId_status_idx" ON "incidents"("serverId", "status");
CREATE INDEX "incidents_severity_status_idx" ON "incidents"("severity", "status");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'in_app',
  "read" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
