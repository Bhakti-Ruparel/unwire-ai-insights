/**
 * Shared domain types for the backend.
 * These mirror src/types/project.ts on the frontend — keep them in sync
 * when you add new fields.
 */

export type ProjectStatus = "Analyzed" | "Analyzing" | "Queued" | "Error";
export type AnalysisStatus = "idle" | "queued" | "processing" | "complete" | "failed";
export type DependencyType = "runtime" | "dev" | "peer";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// ─── Project ───────────────────────────────────────────────────────────────

export interface ProjectDTO {
  id: string;
  name: string;
  description: string;
  sourceType: "zip" | "github";
  githubUrl?: string | null;
  status: ProjectStatus;
  analysisStatus: AnalysisStatus;
  stack: string[];
  filesCount: number;
  apiCount: number;
  dependenciesCount: number;
  createdAt: string;
  updatedAt: string;
  lastAnalyzed: string;
  // Detail fields — present on single-project responses
  framework?: string;
  database?: string;
  externalServices?: string[];
}

// ─── API Endpoint ──────────────────────────────────────────────────────────

export interface APIEndpointDTO {
  id: string;
  method: HttpMethod;
  path: string;
  file: string;
  usage: number;
  description?: string;
  authenticated?: boolean;
  middleware?: string[];
}

// ─── External Service ──────────────────────────────────────────────────────

export interface ExternalServiceDTO {
  id?: string;
  name: string;
  type: string;
  usage: number;
  file: string;
}

// ─── Dependency ────────────────────────────────────────────────────────────

export interface DependencyDTO {
  name: string;
  version: string;
  type: DependencyType;
}

// ─── Database Schema ───────────────────────────────────────────────────────

export interface DatabaseTableDTO {
  table: string;
  fields: string[];
}

// ─── Backend Info ──────────────────────────────────────────────────────────

export interface BackendInfoDTO {
  projectId: string;
  framework: string;
  routesCount: number;
  controllersCount: number;
  middleware: string[];
  requestFlow: string;
}

// ─── Architecture Node ─────────────────────────────────────────────────────

export interface ArchitectureNodeDTO {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  type?: "frontend" | "api" | "backend" | "database" | "external";
}

// ─── Overview ──────────────────────────────────────────────────────────────

export interface ProjectOverviewDTO {
  projectId: string;
  framework: string;
  filesCount: number;
  apiCount: number;
  database: string;
  dependenciesCount: number;
  externalServices: ExternalServiceDTO[];
  externalServicesCount: number;
  architectureNodes: ArchitectureNodeDTO[];
  architectureEdges: { from: string; to: string; label?: string }[];
}

// ─── Request Payloads ──────────────────────────────────────────────────────

export interface CreateProjectBody {
  name: string;
  sourceType: "zip" | "github";
  githubUrl?: string;
}

// ─── API Response Envelope ─────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
