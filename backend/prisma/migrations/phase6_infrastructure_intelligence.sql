-- Phase 6: real server agent telemetry and heartbeat storage.

ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "cpuUsage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "cpuCores" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "loadAverage" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "memoryTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "memoryUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "memoryFree" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "diskTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE server_metrics ADD COLUMN IF NOT EXISTS "diskUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE server_metrics
SET
  "cpuUsage" = COALESCE(NULLIF("cpuUsage", 0), "cpuPercent"),
  "memoryUsed" = COALESCE(NULLIF("memoryUsed", 0), "ramPercent"),
  "diskUsed" = COALESCE(NULLIF("diskUsed", 0), "diskPercent")
WHERE "cpuUsage" = 0 OR "memoryUsed" = 0 OR "diskUsed" = 0;

CREATE TABLE IF NOT EXISTS server_heartbeats (
  id TEXT PRIMARY KEY,
  "serverId" TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online',
  "agentVersion" TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_server_heartbeats_serverId_timestamp ON server_heartbeats("serverId", timestamp);
CREATE INDEX IF NOT EXISTS idx_server_metrics_serverId_recordedAt ON server_metrics("serverId", "recordedAt");
