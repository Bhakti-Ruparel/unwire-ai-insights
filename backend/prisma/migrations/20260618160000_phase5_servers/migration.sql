-- Phase 5: Server Management Tables

ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS servers (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'custom',
  region TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown',
  "sshUser" TEXT NOT NULL DEFAULT 'root',
  "sshPort" INTEGER NOT NULL DEFAULT 22,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_server_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_servers_userId ON servers("userId");

CREATE TABLE IF NOT EXISTS server_metrics (
  id TEXT NOT NULL PRIMARY KEY,
  "serverId" TEXT NOT NULL,
  "cpuPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ramPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "diskPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "networkIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "networkOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_metric_server FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_metrics_serverId ON server_metrics("serverId", "recordedAt");

CREATE TABLE IF NOT EXISTS server_apps (
  id TEXT NOT NULL PRIMARY KEY,
  "serverId" TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'node',
  status TEXT NOT NULL DEFAULT 'stopped',
  port INTEGER,
  pid INTEGER,
  uptime TEXT NOT NULL DEFAULT '',
  memory DOUBLE PRECISION NOT NULL DEFAULT 0,
  cpu DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastAction" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_server FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_apps_serverId ON server_apps("serverId");

CREATE TABLE IF NOT EXISTS server_logs (
  id TEXT NOT NULL PRIMARY KEY,
  "serverId" TEXT NOT NULL,
  "appName" TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_server FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_logs_serverId ON server_logs("serverId", timestamp);
CREATE INDEX IF NOT EXISTS idx_server_logs_appName ON server_logs("serverId", "appName");

CREATE TABLE IF NOT EXISTS server_domains (
  id TEXT NOT NULL PRIMARY KEY,
  "serverId" TEXT NOT NULL,
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'A',
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_domain_server FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_domains_serverId ON server_domains("serverId");

CREATE TABLE IF NOT EXISTS ssl_certs (
  id TEXT NOT NULL PRIMARY KEY,
  "serverId" TEXT NOT NULL,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'letsencrypt',
  status TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3),
  "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ssl_server FOREIGN KEY ("serverId") REFERENCES servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ssl_certs_serverId ON ssl_certs("serverId");
