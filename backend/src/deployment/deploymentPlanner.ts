/**
 * deploymentPlanner.ts
 *
 * Uses existing code analysis results to produce a DeploymentPlan —
 * a structured description of HOW to deploy this project.
 * Pure function: no DB writes, no side effects.
 */

import { prisma } from "../database/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeploymentPlan {
  runtime:              string;          // "node" | "python" | "java" | "static" | "unknown"
  packageManager:       string;          // "npm" | "yarn" | "pnpm" | "pip" | "mvn"
  buildCommand:         string | null;   // "npm run build"
  startCommand:         string;          // "npm start" | "node dist/server.js"
  port:                 number;          // 3000
  dockerRequired:       boolean;
  dockerComposeNeeded:  boolean;
  nginxNeeded:          boolean;
  environmentVariables: EnvVar[];
  detectedServices:     string[];        // ["PostgreSQL", "Redis"]
  frontendFramework:    string | null;
  backendFramework:     string | null;
  database:             string | null;
  warnings:             string[];
}

export interface EnvVar {
  key:        string;
  required:   boolean;
  example:    string;
  description: string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * planDeployment
 *
 * Reads project analysis data from PostgreSQL and returns a DeploymentPlan.
 */
export async function planDeployment(projectId: string): Promise<DeploymentPlan> {
  const [project, deps, backend, externalServices] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.dependency.findMany({ where: { projectId, type: "runtime" } }),
    prisma.backendInfo.findUnique({ where: { projectId } }),
    prisma.externalService.findMany({ where: { projectId } }),
  ]);

  if (!project) throw new Error(`Project ${projectId} not found`);

  const stack     = project.stack ?? [];
  const depNames  = deps.map((d) => d.name.toLowerCase());
  const warnings: string[] = [];

  // ── Detect runtime ────────────────────────────────────────────────────────
  const hasPython = stack.some((s) => ["FastAPI", "Django", "Flask"].includes(s));
  const hasJava   = stack.some((s) => ["Spring Boot"].includes(s));
  const hasNode   = !hasPython && !hasJava;

  const runtime       = hasPython ? "python" : hasJava ? "java" : "node";
  const packageManager = hasJava ? "mvn" : hasPython ? "pip" : detectPackageManager(depNames);

  // ── Detect framework info ─────────────────────────────────────────────────
  const FRONTEND_FRAMEWORKS = ["React", "Next.js", "Vue", "Angular", "Svelte", "Astro"];
  const BACKEND_FRAMEWORKS  = ["Express", "Fastify", "NestJS", "Hono", "Koa", "FastAPI", "Django", "Flask", "Spring Boot"];
  const DB_NAMES            = ["MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis"];

  const frontendFramework = stack.find((s) => FRONTEND_FRAMEWORKS.includes(s)) ?? null;
  const backendFramework  = backend?.framework || stack.find((s) => BACKEND_FRAMEWORKS.includes(s)) || null;
  const database          = stack.find((s) => DB_NAMES.includes(s)) ?? null;

  // ── Build / start commands ────────────────────────────────────────────────
  const buildCommand = detectBuildCommand(frontendFramework, backendFramework, runtime, depNames);
  const startCommand = detectStartCommand(backendFramework, runtime, depNames);
  const port         = detectPort(backendFramework, frontendFramework, runtime);

  // ── Service detection ─────────────────────────────────────────────────────
  const detectedServices = externalServices.map((s) => s.name);
  if (database && !detectedServices.includes(database)) detectedServices.unshift(database);

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (!database) warnings.push("No database detected — add DATABASE_URL if your app requires a database.");
  if (!frontendFramework && !backendFramework) warnings.push("Could not detect framework. Deployment plan may be incomplete.");
  if (depNames.includes("sqlite3") || depNames.includes("better-sqlite3")) {
    warnings.push("SQLite detected — not recommended for production. Consider PostgreSQL.");
  }

  // ── Environment variables ─────────────────────────────────────────────────
  const envVars = buildEnvVars(database, detectedServices, backendFramework, frontendFramework);

  return {
    runtime,
    packageManager,
    buildCommand,
    startCommand,
    port,
    dockerRequired:       true,   // always recommend Docker for production
    dockerComposeNeeded:  !!database,
    nginxNeeded:          !!frontendFramework || !!backendFramework,
    environmentVariables: envVars,
    detectedServices,
    frontendFramework,
    backendFramework,
    database,
    warnings,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectPackageManager(depNames: string[]): string {
  // Can't reliably detect without filesystem access; default to npm
  return "npm";
}

function detectBuildCommand(
  fe: string | null, be: string | null,
  runtime: string, depNames: string[]
): string | null {
  if (fe === "Next.js") return "npm run build";
  if (fe && ["React", "Vue", "Angular", "Svelte", "Astro"].includes(fe)) return "npm run build";
  if (be && ["NestJS"].includes(be)) return "npm run build";
  if (runtime === "python" || runtime === "java") return null;
  // Check for common build scripts
  if (depNames.includes("typescript") || depNames.includes("ts-node")) return "npm run build";
  return null;
}

function detectStartCommand(be: string | null, runtime: string, depNames: string[]): string {
  if (runtime === "python") {
    if (be === "FastAPI") return "uvicorn main:app --host 0.0.0.0 --port 8000";
    if (be === "Django")  return "python manage.py runserver 0.0.0.0:8000";
    if (be === "Flask")   return "python app.py";
    return "python main.py";
  }
  if (runtime === "java") return "java -jar target/*.jar";
  // Node
  if (be === "NestJS") return "node dist/main.js";
  if (depNames.includes("typescript")) return "node dist/server.js";
  return "npm start";
}

function detectPort(be: string | null, fe: string | null, runtime: string): number {
  if (runtime === "python")       return 8000;
  if (be === "NestJS")            return 3000;
  if (be === "Express")           return 5000;
  if (fe === "Next.js")           return 3000;
  if (fe && !be)                  return 80;   // static frontend
  return 3000;
}

function buildEnvVars(
  database: string | null,
  services: string[],
  be: string | null,
  fe: string | null
): EnvVar[] {
  const vars: EnvVar[] = [
    { key: "NODE_ENV", required: true, example: "production", description: "Runtime environment" },
    { key: "PORT",     required: false, example: "3000", description: "Port the app listens on" },
  ];

  if (database === "PostgreSQL") vars.push({ key: "DATABASE_URL", required: true, example: "postgresql://user:pass@localhost:5432/db", description: "PostgreSQL connection string" });
  if (database === "MongoDB")    vars.push({ key: "MONGODB_URI",  required: true, example: "mongodb://localhost:27017/db", description: "MongoDB connection string" });
  if (database === "MySQL")      vars.push({ key: "DATABASE_URL", required: true, example: "mysql://user:pass@localhost:3306/db", description: "MySQL connection string" });
  if (database === "Redis")      vars.push({ key: "REDIS_URL",    required: false, example: "redis://localhost:6379", description: "Redis connection string" });

  if (services.includes("Stripe")) vars.push({ key: "STRIPE_SECRET_KEY", required: true, example: "sk_live_...", description: "Stripe secret key" });
  if (services.includes("OpenAI")) vars.push({ key: "OPENAI_API_KEY",    required: true, example: "sk-...",      description: "OpenAI API key" });
  if (services.includes("SendGrid")) vars.push({ key: "SENDGRID_API_KEY", required: true, example: "SG...",     description: "SendGrid API key" });

  // Auth secret for JWT-based projects
  if (be && ["Express", "Fastify", "NestJS", "Koa", "Hono"].includes(be)) {
    vars.push({ key: "JWT_SECRET", required: true, example: "your-super-secret-32-char-string", description: "JWT signing secret" });
  }

  return vars;
}
