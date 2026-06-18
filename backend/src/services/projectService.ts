import { prisma } from "../database/db";
import { analyzeProject } from "./analyzerService";
import { cloneRepository, sanitizeGitHubUrl } from "./githubService";
import { projectSourceDir } from "./fileService";
import type {
  ProjectDTO,
  APIEndpointDTO,
  DependencyDTO,
  DatabaseTableDTO,
  BackendInfoDTO,
  ProjectOverviewDTO,
  CreateProjectBody,
  ExternalServiceDTO,
} from "../models/Project";

// ─── Helpers ───────────────────────────────────────────────────────────────

function toProjectDTO(
  row: {
    id: string;
    name: string;
    description: string;
    sourceType: string;
    githubUrl: string | null;
    status: string;
    analysisStatus: string;
    stack: string[];
    createdAt: Date;
    updatedAt: Date;
    stats?: { filesCount: number; apiCount: number; dependencyCount: number } | null;
    backend?: { framework: string } | null;
  }
): ProjectDTO {
  const stats = row.stats;
  const lastAnalyzed = formatRelativeTime(row.updatedAt);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceType: row.sourceType as "zip" | "github",
    githubUrl: row.githubUrl ?? undefined,
    status: row.status as ProjectDTO["status"],
    analysisStatus: row.analysisStatus as ProjectDTO["analysisStatus"],
    stack: row.stack,
    filesCount: stats?.filesCount ?? 0,
    apiCount: stats?.apiCount ?? 0,
    dependenciesCount: stats?.dependencyCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastAnalyzed,
    framework: row.backend?.framework,
  };
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

// ─── Service functions ─────────────────────────────────────────────────────

export async function getAllProjects(userId?: string): Promise<ProjectDTO[]> {
  const where = userId ? { userId } : {};
  const rows = await prisma.project.findMany({
    where,
    include: { stats: true, backend: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toProjectDTO);
}

export async function getProjectById(id: string, userId?: string): Promise<ProjectDTO | null> {
  const row = await prisma.project.findUnique({
    where: { id },
    include: { stats: true, backend: true },
  });
  if (!row) return null;
  // If userId provided, ensure project belongs to user
  if (userId && row.userId && row.userId !== userId) return null;
  return toProjectDTO(row);
}

export async function createProjectRecord(
  body: CreateProjectBody,
  uploadedFilePath?: string,
  userId?: string
): Promise<ProjectDTO> {
  const project = await prisma.project.create({
    data: {
      name: body.name,
      sourceType: body.sourceType,
      githubUrl: body.githubUrl ?? null,
      status: "Queued",
      analysisStatus: "queued",
      userId: userId ?? null,
      stats: { create: {} },
    },
    include: { stats: true, backend: true },
  });

  if (uploadedFilePath) {
    runAnalysis(project.id, uploadedFilePath, body.name, false).catch((err) => {
      console.error(`[analyzer] Failed for project ${project.id}:`, err);
    });
  } else if (body.sourceType === "github" && body.githubUrl) {
    runGitHubAnalysis(project.id, body.githubUrl, body.name).catch((err) => {
      console.error(`[analyzer] GitHub failed for project ${project.id}:`, err);
    });
  }

  return toProjectDTO(project);
}

export async function attachUpload(projectId: string, filePath: string): Promise<void> {
  console.log("[UPLOAD] attaching to project:", projectId, "path:", filePath);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const projectName = project?.name ?? projectId;

  await prisma.project.update({
    where: { id: projectId },
    data: { analysisStatus: "queued", status: "Queued" },
  });

  runAnalysis(projectId, filePath, projectName, false).catch((err) => {
    console.error(`[analyzer] Failed for project ${projectId}:`, err);
  });
}

// ─── Sub-resource queries ──────────────────────────────────────────────────

export async function getProjectAPIs(projectId: string): Promise<APIEndpointDTO[]> {
  const rows = await prisma.aPIEndpoint.findMany({ where: { projectId } });
  return rows.map((r) => ({
    id: r.id,
    method: r.method as APIEndpointDTO["method"],
    path: r.path,
    file: r.file,
    usage: r.usage,
    description: r.description || undefined,
    authenticated: r.authenticated,
    middleware: r.middleware,
  }));
}

export async function getProjectDependencies(projectId: string): Promise<DependencyDTO[]> {
  const rows = await prisma.dependency.findMany({ where: { projectId } });
  return rows.map((r) => ({
    name: r.name,
    version: r.version,
    type: r.type as DependencyDTO["type"],
  }));
}

export async function getProjectSchema(projectId: string): Promise<DatabaseTableDTO[]> {
  const rows = await prisma.schemaTable.findMany({ where: { projectId } });
  return rows.map((r) => ({ table: r.tableName, fields: r.fields }));
}

export async function getProjectBackend(projectId: string): Promise<BackendInfoDTO | null> {
  const row = await prisma.backendInfo.findUnique({ where: { projectId } });
  if (!row) return null;
  return {
    projectId: row.projectId,
    framework: row.framework,
    routesCount: row.routes,
    controllersCount: row.controllers,
    middleware: row.middleware,
    requestFlow: row.requestFlow,
  };
}

export async function getProjectExternalServices(projectId: string): Promise<ExternalServiceDTO[]> {
  const rows = await prisma.externalService.findMany({ where: { projectId } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    usage: r.usage,
    file: r.file,
  }));
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverviewDTO | null> {
  const [project, stats, backend, externalServices] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectStats.findUnique({ where: { projectId } }),
    prisma.backendInfo.findUnique({ where: { projectId } }),
    prisma.externalService.findMany({ where: { projectId } }),
  ]);
  if (!project) return null;

  const DB_NAMES = ["MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis", "DynamoDB", "Supabase"];
  const detectedDb = project.stack.find((s) => DB_NAMES.includes(s)) ?? "Unknown";

  // Build architecture graph from stored data
  const { buildArchitectureGraph } = await import("./architectureService");
  const frontendFrameworks = project.stack.filter((s) =>
    ["React", "Next.js", "Vue", "Angular", "Svelte", "Astro"].includes(s)
  );
  const backendFrameworks = project.stack.filter((s) =>
    ["Express", "Fastify", "Koa", "NestJS", "Hono", "FastAPI", "Django", "Flask", "Spring Boot"].includes(s)
  );
  const databases = project.stack.filter((s) => DB_NAMES.includes(s));

  const { nodes, edges } = buildArchitectureGraph({
    frontendFrameworks,
    backendFrameworks,
    databases,
    externalServices: externalServices.map((s) => s.name),
    hasTypeScript: project.stack.includes("TypeScript"),
    apiCount: stats?.apiCount ?? 0,
  });

  const extServiceDTOs: ExternalServiceDTO[] = externalServices.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    usage: s.usage,
    file: s.file,
  }));

  return {
    projectId,
    framework: backend?.framework ?? "",
    filesCount: stats?.filesCount ?? 0,
    apiCount: stats?.apiCount ?? 0,
    database: detectedDb,
    dependenciesCount: stats?.dependencyCount ?? 0,
    externalServices: extServiceDTOs,
    externalServicesCount: externalServices.length,
    architectureNodes: nodes,
    architectureEdges: edges,
  };
}

// ─── Background analysis (ZIP) ─────────────────────────────────────────────

async function runAnalysis(
  projectId: string,
  zipPath: string,
  projectName: string,
  alreadyExtracted: boolean
): Promise<void> {
  console.log("[ANALYSIS START] projectId:", projectId, "zipPath:", zipPath);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "Analyzing", analysisStatus: "processing" },
  });

  try {
    const result = await analyzeProject(zipPath, projectId, projectName, alreadyExtracted);
    await persistAnalysisResult(projectId, result);
    console.log(`[analyzer] Project ${projectId} analysis complete.`);
  } catch (err) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "Error", analysisStatus: "failed" },
    });
    throw err;
  }
}

// ─── Background analysis (GitHub) ─────────────────────────────────────────

async function runGitHubAnalysis(
  projectId: string,
  githubUrl: string,
  projectName: string
): Promise<void> {
  console.log("[GITHUB ANALYSIS START] projectId:", projectId, "url:", githubUrl);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "Analyzing", analysisStatus: "processing" },
  });

  try {
    const cleanUrl = sanitizeGitHubUrl(githubUrl);
    const sourceDir = await cloneRepository(cleanUrl, projectId);
    const result = await analyzeProject(sourceDir, projectId, projectName, /* alreadyExtracted */ true);
    await persistAnalysisResult(projectId, result);
    console.log(`[analyzer] GitHub project ${projectId} analysis complete.`);
  } catch (err) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "Error", analysisStatus: "failed" },
    });
    throw err;
  }
}

// ─── Shared persistence ────────────────────────────────────────────────────

async function persistAnalysisResult(projectId: string, result: Awaited<ReturnType<typeof analyzeProject>>): Promise<void> {
  console.log("[DB WRITE] saving analysis:", {
    files: result.filesCount,
    apis: result.apis.length,
    deps: result.dependencies.length,
    schema: result.schema.length,
    services: result.externalServices.length,
  });

  await prisma.$transaction(async (tx) => {
    // Update project
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: "Analyzed",
        analysisStatus: "complete",
        stack: result.stack,
        description: `${result.framework} project — ${result.filesCount} files, ${result.apis.length} API endpoints, ${result.dependencies.length} dependencies.`,
      },
    });

    // Upsert stats
    await tx.projectStats.upsert({
      where: { projectId },
      create: {
        projectId,
        filesCount: result.filesCount,
        apiCount: result.apis.length,
        dependencyCount: result.dependencies.length,
        externalCount: result.externalServices.length,
        schemaCount: result.schema.length,
      },
      update: {
        filesCount: result.filesCount,
        apiCount: result.apis.length,
        dependencyCount: result.dependencies.length,
        externalCount: result.externalServices.length,
        schemaCount: result.schema.length,
      },
    });

    // Replace API endpoints
    await tx.aPIEndpoint.deleteMany({ where: { projectId } });
    if (result.apis.length > 0) {
      await tx.aPIEndpoint.createMany({
        data: result.apis.map((a) => ({
          projectId,
          method: a.method,
          path: a.path,
          file: a.file,
          description: a.description ?? "",
          usage: a.usage,
          authenticated: a.authenticated ?? false,
          middleware: a.middleware ?? [],
        })),
      });
    }

    // Replace dependencies
    await tx.dependency.deleteMany({ where: { projectId } });
    if (result.dependencies.length > 0) {
      await tx.dependency.createMany({
        data: result.dependencies.map((d) => ({
          projectId,
          name: d.name,
          version: d.version,
          type: d.type,
        })),
      });
    }

    // Replace schema tables
    await tx.schemaTable.deleteMany({ where: { projectId } });
    if (result.schema.length > 0) {
      await tx.schemaTable.createMany({
        data: result.schema.map((t) => ({
          projectId,
          tableName: t.table,
          fields: t.fields,
        })),
      });
    }

    // Replace external services
    await tx.externalService.deleteMany({ where: { projectId } });
    if (result.externalServices.length > 0) {
      await tx.externalService.createMany({
        data: result.externalServices.map((s) => ({
          projectId,
          name: s.name,
          type: s.type,
          usage: s.usage,
          file: s.file,
        })),
      });
    }

    // Upsert backend info
    await tx.backendInfo.upsert({
      where: { projectId },
      create: {
        projectId,
        framework: result.backend.framework,
        routes: result.backend.routesCount,
        controllers: result.backend.controllersCount,
        middleware: result.backend.middleware,
        requestFlow: result.backend.requestFlow,
      },
      update: {
        framework: result.backend.framework,
        routes: result.backend.routesCount,
        controllers: result.backend.controllersCount,
        middleware: result.backend.middleware,
        requestFlow: result.backend.requestFlow,
      },
    });
  });
}
