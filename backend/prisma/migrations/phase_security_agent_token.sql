-- Add agentToken column to servers for secure agent authentication
ALTER TABLE servers ADD COLUMN IF NOT EXISTS "agentToken" TEXT;
-- Generate tokens for existing servers (will be properly set when agent is installed)
UPDATE servers SET "agentToken" = encode(sha256(random()::text::bytea), 'hex') WHERE "agentToken" IS NULL;
