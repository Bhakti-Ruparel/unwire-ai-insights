-- Unwire AI Phase 1 — Complete Schema Migration
-- Run this manually if `prisma migrate dev` fails due to DB credentials.
-- psql -U <user> -d unwire_ai -f prisma/migrations/phase1_complete.sql

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'zip',
    "githubUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "analysisStatus" TEXT NOT NULL DEFAULT 'queued',
    "stack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_stats" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filesCount" INTEGER NOT NULL DEFAULT 0,
    "apiCount" INTEGER NOT NULL DEFAULT 0,
    "dependencyCount" INTEGER NOT NULL DEFAULT 0,
    "externalCount" INTEGER NOT NULL DEFAULT 0,
    "schemaCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "api_endpoints" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "file" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "usage" INTEGER NOT NULL DEFAULT 0,
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "middleware" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "dependencies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'runtime',
    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "external_services" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "usage" INTEGER NOT NULL DEFAULT 0,
    "file" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "external_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "backend_info" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "framework" TEXT NOT NULL DEFAULT '',
    "routes" INTEGER NOT NULL DEFAULT 0,
    "controllers" INTEGER NOT NULL DEFAULT 0,
    "middleware" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestFlow" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "backend_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "schema_tables" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "schema_tables_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "project_stats_projectId_key" ON "project_stats"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "backend_info_projectId_key" ON "backend_info"("projectId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "project_stats" ADD CONSTRAINT "project_stats_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "api_endpoints" ADD CONSTRAINT "api_endpoints_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "external_services" ADD CONSTRAINT "external_services_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "backend_info" ADD CONSTRAINT "backend_info_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "schema_tables" ADD CONSTRAINT "schema_tables_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Alter existing tables if upgrading from a previous migration
-- (adds new columns that may not exist yet)
ALTER TABLE "api_endpoints" ADD COLUMN IF NOT EXISTS "middleware" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "project_stats" ADD COLUMN IF NOT EXISTS "externalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "project_stats" ADD COLUMN IF NOT EXISTS "schemaCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "userId" TEXT;
