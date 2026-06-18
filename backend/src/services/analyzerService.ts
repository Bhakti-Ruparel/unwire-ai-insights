/**
 * analyzerService.ts
 *
 * Orchestrates the full project analysis pipeline:
 *
 *   extractProject      → fileService
 *   scanProject         → codeScanner
 *   detectFramework     → (inline, driven by manifest files)
 *   analyzeAPIs         → apiAnalyzer
 *   analyzeDeps         → dependencyAnalyzer
 *   extractSchema       → schemaExtractor  (NEW)
 *   detectExtSvcs       → externalServiceDetector  (NEW)
 *   buildArchGraph      → architectureService  (NEW)
 *
 * The sourceDir parameter allows the pipeline to be used for both
 * ZIP uploads and GitHub clones — the caller decides how to populate
 * the source directory.
 */

import fs from "fs";
import path from "path";

import { extractProject } from "./fileService";
import { scanProject, type ScannedFile } from "./codeScanner";
import { analyzeAPIs } from "./apiAnalyzer";
import { analyzeDependencies } from "./dependencyAnalyzer";
import { extractSchema } from "./schemaExtractor";
import { detectExternalServices, type ExternalServiceDTO } from "./externalServiceDetector";
import { buildArchitectureGraph } from "./architectureService";

import type {
  APIEndpointDTO,
  DependencyDTO,
  DatabaseTableDTO,
  BackendInfoDTO,
  ArchitectureNodeDTO,
} from "../models/Project";
import type { ArchitectureEdge } from "./architectureService";

// ─── AnalysisResult ────────────────────────────────────────────────────────

export interface AnalysisResult {
  framework: string;
  database: string;
  stack: string[];
  externalServices: ExternalServiceDTO[];
  filesCount: number;
  apis: Omit<APIEndpointDTO, "id">[];
  dependencies: DependencyDTO[];
  schema: Omit<DatabaseTableDTO, "id">[];
  backend: Omit<BackendInfoDTO, "projectId">;
  architectureNodes: ArchitectureNodeDTO[];
  architectureEdges: ArchitectureEdge[];
  // Internal detection result for building graph
  _detection?: FrameworkDetection;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * analyzeProject
 *
 * @param zipOrSourcePath  Either the path to a .zip file OR an already-extracted
 *                         source directory (for GitHub clone support).
 * @param projectId        UUID used to locate the upload directory
 * @param projectName      Human-readable name (used for logging)
 * @param alreadyExtracted If true, zipOrSourcePath is treated as the source dir directly
 */
export async function analyzeProject(
  zipOrSourcePath: string,
  projectId: string,
  projectName: string,
  alreadyExtracted = false
): Promise<AnalysisResult> {
  console.log(`[analyzer] Starting analysis for "${projectName}" (${projectId})`);

  // ── Step 1: Extract ZIP (or use existing source dir) ──────────────────
  let sourceDir: string;
  if (alreadyExtracted) {
    sourceDir = zipOrSourcePath;
    console.log(`[analyzer] Step 1/6 — Using existing source dir: ${sourceDir}`);
  } else {
    console.log("[analyzer] Step 1/6 — Extracting ZIP…");
    sourceDir = await extractProject(zipOrSourcePath, projectId);
    console.log(`[analyzer] Extracted to: ${sourceDir}`);
  }

  // ── Step 2: Scan files ─────────────────────────────────────────────────
  console.log("[analyzer] Step 2/6 — Scanning files…");
  const { filesCount, files } = scanProject(sourceDir);
  console.log(`[analyzer] Found ${filesCount} files`);

  // ── Step 3: Detect framework & database ───────────────────────────────
  console.log("[analyzer] Step 3/6 — Detecting framework & database…");
  const detection = detectFrameworkAndDatabase(sourceDir, files);
  console.log(`[analyzer] Detected: ${detection.frontendFrameworks.join(", ")} / ${detection.backendFrameworks.join(", ")} / ${detection.databases.join(", ")}`);

  // ── Step 4: Detect API endpoints ──────────────────────────────────────
  console.log("[analyzer] Step 4/6 — Detecting API endpoints…");
  const rawApis = analyzeAPIs(files);
  // Keep only backend-style routes (skip raw frontend fetch/axios calls)
  const apis = rawApis.filter((a) => !a.description?.includes("Frontend"));
  console.log(`[analyzer] Found ${apis.length} API endpoints`);

  // ── Step 5: Detect dependencies ───────────────────────────────────────
  console.log("[analyzer] Step 5/6 — Analyzing dependencies…");
  const { dependencies } = analyzeDependencies(sourceDir, files);
  console.log(`[analyzer] Found ${dependencies.length} dependencies`);

  // ── Step 6: Extract schema ────────────────────────────────────────────
  console.log("[analyzer] Step 6/6 — Extracting database schema…");
  const schema = extractSchema(files);
  console.log(`[analyzer] Found ${schema.length} schema tables/models`);

  // ── Build composite results ────────────────────────────────────────────
  const stack = buildStack(detection);
  const framework = buildFrameworkString(detection);
  const database = detection.databases[0] ?? "Unknown";

  // Detect external services from both deps and imports
  const externalServices = detectExternalServices(dependencies, files);
  console.log(`[analyzer] Found ${externalServices.length} external services`);

  const backend = buildBackendInfo(detection, apis);

  // Build dynamic architecture graph
  const { nodes: architectureNodes, edges: architectureEdges } = buildArchitectureGraph({
    frontendFrameworks: detection.frontendFrameworks,
    backendFrameworks: detection.backendFrameworks,
    databases: detection.databases,
    externalServices: externalServices.map((s) => s.name),
    hasTypeScript: detection.hasTypeScript,
    apiCount: apis.length,
  });

  console.log(`[analyzer] Analysis complete: ${filesCount} files, ${apis.length} APIs, ${dependencies.length} deps, ${schema.length} tables, ${externalServices.length} services`);

  return {
    framework,
    database,
    stack,
    externalServices,
    filesCount,
    apis,
    dependencies,
    schema,
    backend,
    architectureNodes,
    architectureEdges,
  };
}

// ─── Framework / Database Detection ───────────────────────────────────────

export interface FrameworkDetection {
  frontendFrameworks: string[];
  backendFrameworks: string[];
  databases: string[];
  hasTypeScript: boolean;
  hasPython: boolean;
  hasJava: boolean;
}

function detectFrameworkAndDatabase(
  rootDir: string,
  files: ScannedFile[]
): FrameworkDetection {
  const result: FrameworkDetection = {
    frontendFrameworks: [],
    backendFrameworks: [],
    databases: [],
    hasTypeScript: false,
    hasPython: false,
    hasJava: false,
  };

  // ── Language presence ──────────────────────────────────────────────────
  result.hasTypeScript = files.some((f) => f.extension === "ts" || f.extension === "tsx");
  result.hasPython     = files.some((f) => f.extension === "py");
  result.hasJava       = files.some((f) => f.extension === "java" || f.extension === "kt");

  // ── package.json ───────────────────────────────────────────────────────
  const pkgFile = files.find((f) => f.relativePath === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile.absolutePath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Frontend
      if (allDeps["next"])                    result.frontendFrameworks.push("Next.js");
      else if (allDeps["react"])              result.frontendFrameworks.push("React");
      if (allDeps["vue"])                     result.frontendFrameworks.push("Vue");
      if (allDeps["@angular/core"])           result.frontendFrameworks.push("Angular");
      if (allDeps["svelte"])                  result.frontendFrameworks.push("Svelte");
      if (allDeps["astro"])                   result.frontendFrameworks.push("Astro");

      // Backend
      if (allDeps["express"])                 result.backendFrameworks.push("Express");
      if (allDeps["fastify"])                 result.backendFrameworks.push("Fastify");
      if (allDeps["koa"])                     result.backendFrameworks.push("Koa");
      if (allDeps["hono"])                    result.backendFrameworks.push("Hono");
      if (allDeps["@nestjs/core"])            result.backendFrameworks.push("NestJS");

      // Databases (JS drivers)
      if (allDeps["mongoose"] || allDeps["mongodb"]) result.databases.push("MongoDB");
      if (allDeps["pg"] || allDeps["@prisma/client"] || allDeps["typeorm"]) result.databases.push("PostgreSQL");
      if (allDeps["mysql"] || allDeps["mysql2"])  result.databases.push("MySQL");
      if (allDeps["redis"] || allDeps["ioredis"]) result.databases.push("Redis");
      if (allDeps["sqlite3"] || allDeps["better-sqlite3"]) result.databases.push("SQLite");
    } catch {
      // Malformed package.json — skip
    }
  }

  // ── requirements.txt ──────────────────────────────────────────────────
  const reqFile = files.find((f) => f.relativePath === "requirements.txt");
  if (reqFile) {
    try {
      const content = fs.readFileSync(reqFile.absolutePath, "utf-8").toLowerCase();
      if (content.includes("fastapi"))  result.backendFrameworks.push("FastAPI");
      if (content.includes("django"))   result.backendFrameworks.push("Django");
      if (content.includes("flask"))    result.backendFrameworks.push("Flask");
      if (content.includes("pymongo"))  result.databases.push("MongoDB");
      if (content.includes("psycopg2") || content.includes("sqlalchemy")) result.databases.push("PostgreSQL");
      if (content.includes("redis"))    result.databases.push("Redis");
    } catch {
      // Skip
    }
  }

  // ── pom.xml ───────────────────────────────────────────────────────────
  const pomFile = files.find((f) => f.relativePath === "pom.xml");
  if (pomFile) {
    try {
      const content = fs.readFileSync(pomFile.absolutePath, "utf-8");
      if (content.includes("spring-boot-starter-web")) result.backendFrameworks.push("Spring Boot");
      if (content.includes("spring-data-jpa") || content.includes("hibernate")) result.databases.push("PostgreSQL");
      if (content.includes("mongodb"))  result.databases.push("MongoDB");
    } catch {
      // Skip
    }
  }

  // ── Prisma schema ─────────────────────────────────────────────────────
  const prismaFile = files.find((f) => f.relativePath.endsWith("schema.prisma"));
  if (prismaFile) {
    try {
      const content = fs.readFileSync(prismaFile.absolutePath, "utf-8");
      const provider = content.match(/provider\s*=\s*"([^"]+)"/)?.[1];
      if (provider) {
        const dbName = capitalise(provider === "postgresql" ? "PostgreSQL" : provider);
        if (!result.databases.includes(dbName)) result.databases.push(dbName);
      }
    } catch {
      // Skip
    }
  }

  return result;
}

// ─── Stack / Framework string builders ────────────────────────────────────

function buildStack(d: FrameworkDetection): string[] {
  return [
    ...d.frontendFrameworks,
    ...d.backendFrameworks,
    ...d.databases,
  ];
}

function buildFrameworkString(d: FrameworkDetection): string {
  const parts = [...d.frontendFrameworks, ...d.backendFrameworks];
  return parts.length > 0 ? parts.join(" + ") : "Unknown";
}

function buildBackendInfo(
  d: FrameworkDetection,
  apis: Omit<APIEndpointDTO, "id">[]
): Omit<BackendInfoDTO, "projectId"> {
  const framework = [...d.backendFrameworks, ...d.frontendFrameworks].join(" + ") || "Unknown";
  const middleware: string[] = [];

  if (d.backendFrameworks.some((f) => ["Express", "Fastify", "Koa", "Hono"].includes(f))) {
    middleware.push("CORS");
    middleware.push("JSON Body Parser");
  }
  if (d.hasPython) middleware.push("CORS Middleware");

  return {
    framework,
    routesCount: apis.length,
    controllersCount: Math.ceil(apis.length / 4),
    middleware,
    requestFlow: buildRequestFlow(d),
  };
}

function buildRequestFlow(d: FrameworkDetection): string {
  if (d.backendFrameworks.includes("Express") || d.backendFrameworks.includes("Fastify")) {
    return "Client → CORS → Body Parser → Router → Controller → Service → DB";
  }
  if (d.backendFrameworks.includes("FastAPI")) {
    return "Client → CORS Middleware → FastAPI Router → Dependency Injection → Handler → DB";
  }
  if (d.backendFrameworks.includes("Django")) {
    return "Client → Django Middleware → URL Router → View → ORM → DB";
  }
  if (d.backendFrameworks.includes("Spring Boot")) {
    return "Client → Spring Security → DispatcherServlet → Controller → Service → Repository → DB";
  }
  if (d.frontendFrameworks.includes("Next.js")) {
    return "Client → Next.js Middleware → API Routes → Server Actions → DB";
  }
  return "Client → Router → Handler → DB";
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
