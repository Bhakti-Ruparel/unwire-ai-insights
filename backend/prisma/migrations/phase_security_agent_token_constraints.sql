-- Enforce Prisma schema expectations for agent token authentication.
UPDATE servers
SET "agentToken" = gen_random_uuid()::text
WHERE "agentToken" IS NULL OR "agentToken" = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_agentToken_unique ON servers("agentToken");

ALTER TABLE servers ALTER COLUMN "agentToken" SET NOT NULL;
