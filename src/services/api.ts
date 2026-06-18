/**
 * API Service Layer
 *
 * All backend communication is centralised here.
 * Components never call fetch() directly — they import from projectService.ts
 * which re-exports from this file.
 */

import type {
  Project,
  APIEndpoint,
  Dependency,
  DatabaseTable,
  BackendInfo,
  ProjectOverview,
  ExternalService,
  DeploymentAnalysis,
  CreateProjectPayload,
  AuthResult,
  LoginPayload,
  SignupPayload,
} from "@/types/project";

// ─── Config ────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:5000";

// ─── Token storage ─────────────────────────────────────────────────────────

const TOKEN_KEY = "unwire_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Shared fetch wrapper ──────────────────────────────────────────────────

interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json: BackendResponse<T> = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }

  return json.data as T;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function authLogin(payload: LoginPayload): Promise<AuthResult> {
  const result = await apiFetch<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setToken(result.token);
  return result;
}

export async function authSignup(payload: SignupPayload): Promise<AuthResult> {
  const result = await apiFetch<AuthResult>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setToken(result.token);
  return result;
}

export function authLogout(): void {
  clearToken();
}

// ─── Project normalization ─────────────────────────────────────────────────

function normalizeProject(raw: Project): Project {
  return {
    ...raw,
    filesCount: Number(raw.filesCount ?? 0),
    apiCount: Number(raw.apiCount ?? 0),
    dependenciesCount: Number(raw.dependenciesCount ?? 0),
    lastAnalyzed: raw.lastAnalyzed ?? "unknown",
    stack: raw.stack ?? [],
    description: raw.description ?? "",
  };
}

// ─── Projects ──────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const projects = await apiFetch<Project[]>("/api/projects");
  return projects.map(normalizeProject);
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  try {
    const project = await apiFetch<Project>(`/api/projects/${id}`);
    return normalizeProject(project);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const project = await apiFetch<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      sourceType: payload.sourceType,
      githubUrl: payload.githubUrl,
    }),
  });
  return normalizeProject(project);
}

export async function createProjectWithZip(
  payload: CreateProjectPayload & { file: File }
): Promise<Project> {
  const project = await createProject(payload);

  const formData = new FormData();
  formData.append("file", payload.file);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/projects/${project.id}/upload`, {
    method: "POST",
    headers,
    body: formData,
  });
  const json: BackendResponse<unknown> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Upload failed.");
  }

  return project;
}

// ─── Project detail sub-resources ─────────────────────────────────────────

export async function fetchProjectOverview(id: string): Promise<ProjectOverview | null> {
  try {
    return await apiFetch<ProjectOverview>(`/api/projects/${id}/overview`);
  } catch {
    return null;
  }
}

export async function fetchProjectAPIs(id: string): Promise<APIEndpoint[]> {
  try {
    return await apiFetch<APIEndpoint[]>(`/api/projects/${id}/apis`);
  } catch {
    return [];
  }
}

export async function fetchProjectDependencies(id: string): Promise<Dependency[]> {
  try {
    return await apiFetch<Dependency[]>(`/api/projects/${id}/dependencies`);
  } catch {
    return [];
  }
}

export async function fetchProjectSchema(id: string): Promise<DatabaseTable[]> {
  try {
    return await apiFetch<DatabaseTable[]>(`/api/projects/${id}/schema`);
  } catch {
    return [];
  }
}

export async function fetchProjectBackend(id: string): Promise<BackendInfo | null> {
  try {
    return await apiFetch<BackendInfo>(`/api/projects/${id}/backend`);
  } catch {
    return null;
  }
}

export async function fetchProjectServices(id: string): Promise<ExternalService[]> {
  try {
    return await apiFetch<ExternalService[]>(`/api/projects/${id}/services`);
  } catch {
    return [];
  }
}

/**
 * Fetches deployment intelligence analysis for a project.
 */
export async function fetchProjectDeployment(id: string): Promise<DeploymentAnalysis | null> {
  try {
    return await apiFetch<DeploymentAnalysis>(`/api/projects/${id}/deployment`);
  } catch {
    return null;
  }
}

/**
 * Triggers a fresh deployment analysis (background job).
 */
export async function refreshProjectDeployment(id: string): Promise<void> {
  try {
    await apiFetch<unknown>(`/api/projects/${id}/deployment/refresh`, { method: "POST" });
  } catch {
    // ignore
  }
}

/**
 * Sends a chat message to the project-specific RAG AI assistant.
 */
export async function sendChatMessage(
  projectId: string,
  message: string,
  sessionId?: string
): Promise<{ answer: string; sources: string[]; sessionId: string }> {
  return await apiFetch<{ answer: string; sources: string[]; sessionId: string }>(
    `/api/projects/${projectId}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ message, sessionId }),
    }
  );
}

/**
 * Triggers download of the project Markdown report.
 * Returns the markdown content as a string.
 */
export async function downloadProjectReport(id: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/projects/${id}/report`, { headers });
  if (!res.ok) throw new Error("Failed to generate report.");
  return res.text();
}
