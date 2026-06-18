// ─── Core Project Types ────────────────────────────────────────────────────

export type ProjectStatus = "Analyzed" | "Analyzing" | "Queued" | "Error";
export type AnalysisStatus = "idle" | "queued" | "processing" | "complete" | "failed";
export type DependencyType = "runtime" | "dev" | "peer";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface Project {
  id: string;
  name: string;
  description: string;
  stack: string[];
  status: ProjectStatus;
  analysisStatus: AnalysisStatus;
  filesCount: number;
  apiCount: number;
  dependenciesCount: number;
  createdAt: string;
  updatedAt: string;
  lastAnalyzed: string;
  // Detail fields (populated when viewing a specific project)
  framework?: string;
  database?: string;
  externalServices?: string[];
  thumbnail?: string;
  githubUrl?: string;
  sourceType?: "zip" | "github";
}

export interface ProjectOverview {
  projectId: string;
  framework: string;
  filesCount: number;
  apiCount: number;
  database: string;
  dependenciesCount: number;
  externalServices: ExternalService[];
  externalServicesCount: number;
  architectureNodes: ArchitectureNode[];
  architectureEdges: ArchitectureEdge[];
}

// ─── External Service ──────────────────────────────────────────────────────

export interface ExternalService {
  id?: string;
  name: string;
  type: string;
  usage: number;
  file: string;
}

// ─── API Endpoint ──────────────────────────────────────────────────────────

export interface APIEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  file: string;
  usage: number;
  description?: string;
  authenticated?: boolean;
  middleware?: string[];
  tags?: string[];
}

// ─── Dependencies ──────────────────────────────────────────────────────────

export interface Dependency {
  name: string;
  version: string;
  type: DependencyType;
  description?: string;
  vulnerabilities?: number;
  outdated?: boolean;
}

// ─── Architecture ──────────────────────────────────────────────────────────

export interface ArchitectureNode {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  type?: "frontend" | "api" | "backend" | "database" | "external";
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

// ─── Database Schema ───────────────────────────────────────────────────────

export interface DatabaseField {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  foreignKey?: string;
}

export interface DatabaseTable {
  table: string;
  fields: string[];
  fieldDetails?: DatabaseField[];
}

export interface DatabaseSchema {
  projectId: string;
  tables: DatabaseTable[];
}

// ─── Backend Info ──────────────────────────────────────────────────────────

export interface BackendInfo {
  projectId: string;
  framework: string;
  routesCount: number;
  controllersCount: number;
  middleware: string[];
  requestFlow: string;
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  timestamp?: string;
}

// ─── API Service Contracts ─────────────────────────────────────────────────

export interface CreateProjectPayload {
  name: string;
  githubUrl?: string;
  sourceType: "zip" | "github";
  file?: File;
}

export interface ProjectsResponse {
  projects: Project[];
  total: number;
}

export interface ProjectDetailResponse {
  project: Project;
  overview: ProjectOverview;
  apis: APIEndpoint[];
  dependencies: Dependency[];
  schema: DatabaseSchema;
  backend: BackendInfo;
}

// ─── Deployment Intelligence ────────────────────────────────────────────────

export type DeploymentSeverity = "INFO" | "WARNING" | "CRITICAL";
export type DeploymentStatus   = "pending" | "processing" | "complete" | "failed";

export interface DeploymentScoreCategory {
  score: number;
  max:   number;
  label: string;
}

export interface DeploymentIssue {
  id:         string;
  severity:   DeploymentSeverity;
  category:   string;
  message:    string;
  file:       string;
  line?:      number;
  suggestion: string;
}

export interface DeploymentRecommendation {
  id:          string;
  priority:    number;
  title:       string;
  description: string;
  category:    string;
  codeSnippet: string;
}

export interface DeploymentFile {
  name:     string;
  path:     string;
  category: string;
}

export interface DeploymentArchNode {
  id:    string;
  label: string;
  sub:   string;
  type:  "user" | "proxy" | "container" | "backend" | "database" | "external" | "ci_cd" | "cloud";
}

export interface DeploymentArchEdge {
  from:   string;
  to:     string;
  label?: string;
}

export interface DeploymentAnalysis {
  projectId:         string;
  status:            DeploymentStatus;
  score:             number;
  scoreBreakdown:    Record<string, DeploymentScoreCategory>;
  filesDetected:     DeploymentFile[];
  issues:            DeploymentIssue[];
  recommendations:   DeploymentRecommendation[];
  architectureNodes: DeploymentArchNode[];
  architectureEdges: DeploymentArchEdge[];
  updatedAt:         string;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
}
