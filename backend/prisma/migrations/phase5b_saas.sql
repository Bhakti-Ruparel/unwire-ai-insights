-- Phase 5b: SaaS Multi-user Architecture

-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Sessions (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions("userId");
CREATE INDEX IF NOT EXISTS idx_sessions_refreshToken ON sessions("refreshToken");

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  "ownerId" TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_owner FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_organizations_ownerId ON organizations("ownerId");

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orgmember_org FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_orgmember_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_orgmember UNIQUE ("organizationId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_org_members_orgId ON organization_members("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_members_userId ON organization_members("userId");

-- Usage records
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usage_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_usage_userId_type ON usage_records("userId", type);
CREATE INDEX IF NOT EXISTS idx_usage_userId_createdAt ON usage_records("userId", "createdAt");

-- Add organizationId to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_orgId ON projects("organizationId");

-- Add organizationId to servers
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
CREATE INDEX IF NOT EXISTS idx_servers_orgId ON servers("organizationId");

-- Add index to projects.userId if not exists
CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects("userId");
