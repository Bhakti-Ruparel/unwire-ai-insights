-- Phase 4: Deployment Intelligence Tables

CREATE TABLE IF NOT EXISTS deployment_analyses (
  id TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  score INTEGER NOT NULL DEFAULT 0,
  "filesDetected" JSONB NOT NULL DEFAULT '[]',
  "scoreBreakdown" JSONB NOT NULL DEFAULT '{}',
  "architectureNodes" JSONB NOT NULL DEFAULT '[]',
  "architectureEdges" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dep_analysis_project FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployment_analyses_projectId ON deployment_analyses("projectId");

CREATE TABLE IF NOT EXISTS deployment_issues (
  id TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  category TEXT NOT NULL DEFAULT 'config',
  message TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  line INTEGER,
  suggestion TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dep_issue_analysis FOREIGN KEY ("analysisId") REFERENCES deployment_analyses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployment_issues_analysisId ON deployment_issues("analysisId");

CREATE TABLE IF NOT EXISTS deployment_recs (
  id TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  "codeSnippet" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dep_rec_analysis FOREIGN KEY ("analysisId") REFERENCES deployment_analyses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployment_recs_analysisId ON deployment_recs("analysisId");
