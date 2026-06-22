-- Phase 6: Deployment Execution Tables

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  plan JSONB NOT NULL DEFAULT '{}',
  "generatedFiles" JSONB NOT NULL DEFAULT '{}',
  "commitSha" TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT 'main',
  environment TEXT NOT NULL DEFAULT 'production',
  error TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dep_project FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_server  FOREIGN KEY ("serverId")  REFERENCES servers(id)  ON DELETE CASCADE,
  CONSTRAINT fk_dep_user    FOREIGN KEY ("userId")    REFERENCES users(id)    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deployments_projectId ON deployments("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_deployments_serverId  ON deployments("serverId",  "createdAt");
CREATE INDEX IF NOT EXISTS idx_deployments_userId    ON deployments("userId",    "createdAt");
CREATE INDEX IF NOT EXISTS idx_deployments_status    ON deployments(status);

CREATE TABLE IF NOT EXISTS deployment_steps (
  id TEXT NOT NULL PRIMARY KEY,
  "deploymentId" TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  "order" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  error TEXT,
  CONSTRAINT fk_step_deployment FOREIGN KEY ("deploymentId") REFERENCES deployments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deployment_steps_depId ON deployment_steps("deploymentId", "order");

CREATE TABLE IF NOT EXISTS deployment_logs (
  id TEXT NOT NULL PRIMARY KEY,
  "deploymentId" TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  "stepName" TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_deployment FOREIGN KEY ("deploymentId") REFERENCES deployments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_depId ON deployment_logs("deploymentId", timestamp);
