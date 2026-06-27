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

const ACCESS_KEY  = "unwire_access_token";
const REFRESH_KEY = "unwire_refresh_token";

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

/** @deprecated use setTokens */
export function setToken(token: string): void { localStorage.setItem(ACCESS_KEY, token); }
/** @deprecated use clearTokens */
export function clearToken(): void { clearTokens(); }

// ─── Refresh mutex (prevents concurrent refresh calls) ─────────────────────

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Ensures only one refresh request runs at a time.
 * Concurrent callers wait for the same promise.
 */
function refreshOnce(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = doRefresh().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) { clearTokens(); return false; }
    setTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
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
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401 (expired access token) — uses mutex to prevent concurrent refreshes
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const newToken = getToken();
      if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

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
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

export async function authSignup(payload: SignupPayload): Promise<AuthResult> {
  const result = await apiFetch<AuthResult>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

export async function authRefresh(): Promise<boolean> {
  return refreshOnce();
}

export async function authLogout(): Promise<void> {
  const refreshToken = getRefreshToken();
  // Clear tokens FIRST to prevent 401→refresh loops during logout
  clearTokens();
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch { /* ignore — tokens already cleared locally */ }
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
 */
export async function downloadProjectReport(id: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/projects/${id}/report`, { headers });
  if (!res.ok) throw new Error("Failed to generate report.");
  return res.text();
}

// ─── Server Management ─────────────────────────────────────────────────────

import type {
  Server,
  ServerApp,
  ServerLog,
  ServerDomain,
  SslCert,
  ServerAIAnswer,
  ServerMetricSnapshot,
  CreateServerPayload,
} from "@/types/project";

export async function fetchServers(): Promise<Server[]> {
  try { return await apiFetch<Server[]>("/api/servers"); }
  catch { return []; }
}

export async function fetchServerById(id: string): Promise<Server | null> {
  try { return await apiFetch<Server>(`/api/servers/${id}`); }
  catch { return null; }
}

export async function createServer(payload: CreateServerPayload): Promise<Server> {
  return apiFetch<Server>("/api/servers", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteServer(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/servers/${id}`, { method: "DELETE" });
}

export async function fetchServerHealth(id: string): Promise<{
  server: Server;
  apps: ServerApp[];
  latestMetric: ServerMetricSnapshot | null;
} | null> {
  try { return await apiFetch(`/api/servers/${id}/health`); }
  catch (err) {
    // Don't swallow the error silently — let the UI know
    if (err instanceof Error && err.message.includes("not found")) return null;
    if (err instanceof Error && err.message.includes("access")) return null;
    return null;
  }
}

export async function fetchServerMetrics(id: string, limit = 60): Promise<ServerMetricSnapshot[]> {
  try { return await apiFetch<ServerMetricSnapshot[]>(`/api/servers/${id}/metrics?limit=${limit}`); }
  catch { return []; }
}

export async function fetchServerApps(id: string): Promise<ServerApp[]> {
  try { return await apiFetch<ServerApp[]>(`/api/servers/${id}/apps`); }
  catch { return []; }
}

export async function triggerAppAction(
  serverId: string,
  appName: string,
  action: "start" | "stop" | "restart"
): Promise<void> {
  await apiFetch<unknown>(`/api/servers/${serverId}/apps/${encodeURIComponent(appName)}/action`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function fetchServerLogs(
  id: string,
  opts: { appName?: string; level?: string; limit?: number } = {}
): Promise<ServerLog[]> {
  const params = new URLSearchParams();
  if (opts.appName) params.set("appName", opts.appName);
  if (opts.level)   params.set("level", opts.level);
  if (opts.limit)   params.set("limit", String(opts.limit));
  try { return await apiFetch<ServerLog[]>(`/api/servers/${id}/logs?${params}`); }
  catch { return []; }
}

export async function fetchServerDomains(id: string): Promise<ServerDomain[]> {
  try { return await apiFetch<ServerDomain[]>(`/api/servers/${id}/domains`); }
  catch { return []; }
}

export async function addServerDomain(
  serverId: string,
  data: { domain: string; type: string; target: string }
): Promise<ServerDomain> {
  return apiFetch<ServerDomain>(`/api/servers/${serverId}/domains`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteServerDomain(serverId: string, domainId: string): Promise<void> {
  await apiFetch<unknown>(`/api/servers/${serverId}/domains/${domainId}`, { method: "DELETE" });
}

export async function fetchServerSslCerts(id: string): Promise<SslCert[]> {
  try { return await apiFetch<SslCert[]>(`/api/servers/${id}/ssl`); }
  catch { return []; }
}

export async function addServerSslCert(
  serverId: string,
  data: { domain: string; provider?: string; autoRenew?: boolean }
): Promise<SslCert> {
  return apiFetch<SslCert>(`/api/servers/${serverId}/ssl`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function askServerQuestion(
  serverId: string,
  message: string
): Promise<ServerAIAnswer> {
  return apiFetch<ServerAIAnswer>(`/api/servers/${serverId}/ask`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ─── Admin API ─────────────────────────────────────────────────────────────

export interface AdminOverview {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  activeUsers30d: number;
  aiMessages: number;
  uploads: number;
  deployments: {
    total: number;
    failed: number;
    running: number;
    avgDeploymentMs: number;
  };
  system: { dbStatus: string; queueStatus: string; aiStatus: string };
}

export interface AdminUser {
  id: string; name: string; email: string; role: string;
  isActive: boolean; projectCount: number; serverCount: number;
  createdAt: string; lastActive: string;
}

export interface AdminUsersResponse {
  total: number; page: number; pages: number; users: AdminUser[];
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/api/admin/overview");
}

export async function fetchAdminUsers(
  opts: { page?: number; limit?: number; search?: string; role?: string } = {}
): Promise<AdminUsersResponse> {
  const p = new URLSearchParams();
  if (opts.page)   p.set("page",   String(opts.page));
  if (opts.limit)  p.set("limit",  String(opts.limit));
  if (opts.search) p.set("search", opts.search);
  if (opts.role)   p.set("role",   opts.role);
  return apiFetch<AdminUsersResponse>(`/api/admin/users?${p}`);
}

export async function fetchAdminUserDetail(userId: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${userId}`);
}

export async function adminSetUserStatus(userId: string, isActive: boolean): Promise<void> {
  await apiFetch<unknown>(`/api/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function adminSetUserRole(userId: string, role: string): Promise<void> {
  await apiFetch<unknown>(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await apiFetch<unknown>(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function fetchAdminUsage(days = 30): Promise<unknown> {
  return apiFetch(`/api/admin/usage?days=${days}`);
}

// ─── Deployment Execution API (Phase 6) ────────────────────────────────────

import type {
  DeploymentRun,
  DeploymentLog,
  DeploymentPlan,
} from "@/types/project";

export interface CreateDeploymentPayload {
  projectId:   string;
  serverId:    string;
  branch?:     string;
  environment?: string;
}

export interface DeploymentListResponse {
  deployments: DeploymentRun[];
  nextCursor:  string | null;
}

export interface DeploymentLogsResponse {
  logs:       DeploymentLog[];
  nextCursor: string | null;
}

export async function apiCreateDeployment(payload: CreateDeploymentPayload): Promise<DeploymentRun> {
  return apiFetch<DeploymentRun>("/api/deployments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiListDeployments(
  projectId: string,
  cursor?: string,
  limit = 20
): Promise<DeploymentListResponse> {
  const p = new URLSearchParams({ projectId, limit: String(limit) });
  if (cursor) p.set("cursor", cursor);
  try {
    return await apiFetch<DeploymentListResponse>(`/api/deployments?${p}`);
  } catch {
    return { deployments: [], nextCursor: null };
  }
}

export async function apiGetDeployment(id: string): Promise<DeploymentRun | null> {
  try { return await apiFetch<DeploymentRun>(`/api/deployments/${id}`); }
  catch { return null; }
}

export async function apiGetDeploymentLogs(
  id: string,
  cursor?: string,
  limit = 100
): Promise<DeploymentLogsResponse> {
  const p = new URLSearchParams({ limit: String(limit) });
  if (cursor) p.set("cursor", cursor);
  try {
    return await apiFetch<DeploymentLogsResponse>(`/api/deployments/${id}/logs?${p}`);
  } catch {
    return { logs: [], nextCursor: null };
  }
}

export async function apiGetDeploymentPlan(projectId: string): Promise<DeploymentPlan | null> {
  try {
    return await apiFetch<DeploymentPlan>(`/api/projects/${projectId}/deployment-plan`);
  } catch {
    return null;
  }
}

export async function apiRollbackDeployment(deploymentId: string): Promise<DeploymentRun> {
  return apiFetch<DeploymentRun>(`/api/deployments/${deploymentId}/rollback`, { method: "POST" });
}

/**
 * Opens an SSE stream for live deployment logs.
 * Returns an EventSource — caller must close it when done.
 */
export function openDeploymentLogStream(
  deploymentId: string,
  onLog: (log: DeploymentLog) => void,
  onDone: (status: string) => void,
  onError?: () => void
): EventSource {
  const token = getToken();
  // EventSource doesn't support Authorization header — pass token as query param
  const url = `${API_BASE}/api/deployments/${deploymentId}/logs/stream?token=${token ?? ""}`;
  const es   = new EventSource(url);

  es.onmessage = (e) => {
    try { onLog(JSON.parse(e.data) as DeploymentLog); } catch { /* skip malformed */ }
  };
  es.addEventListener("done", (e: Event) => {
    const data = JSON.parse((e as MessageEvent).data ?? "{}");
    onDone(data.status ?? "UNKNOWN");
    es.close();
  });
  es.onerror = () => { onError?.(); };

  return es;
}

// ─── AI Agent ──────────────────────────────────────────────────────────────

export interface AgentChatResponse {
  answer: string;
  sources: string[];
  sessionId: string;
  intent?: "info" | "action";
  mode?: "analyst" | "executor";
  toolsUsed?: string[];
  requiresApproval?: boolean;
  approvalMessage?: string;
}

/**
 * Sends a message to the global AI DevOps Agent.
 */
export async function sendAgentMessage(
  message: string,
  sessionId?: string
): Promise<AgentChatResponse> {
  return apiFetch<AgentChatResponse>("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ message, sessionId }),
  });
}

// ─── Alerts & Notifications (Phase 9) ─────────────────────────────────────

export interface AlertItem {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  recommendation: string;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  serverId?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export interface AlertSummary {
  critical: number;
  warning: number;
  resolved: number;
  total: number;
}

export async function fetchAlerts(opts: {
  status?: string; severity?: string; serverId?: string; limit?: number;
} = {}): Promise<{ alerts: AlertItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.severity) params.set("severity", opts.severity);
  if (opts.serverId) params.set("serverId", opts.serverId);
  if (opts.limit) params.set("limit", String(opts.limit));
  return apiFetch(`/api/alerts?${params.toString()}`);
}

export async function fetchAlertSummary(): Promise<AlertSummary> {
  return apiFetch<AlertSummary>("/api/alerts/summary");
}

export async function acknowledgeAlert(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/alerts/${id}/acknowledge`, { method: "PATCH" });
}

export async function resolveAlertApi(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/alerts/${id}/resolve`, { method: "PATCH" });
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(limit = 20): Promise<{ notifications: NotificationItem[]; unread: number }> {
  return apiFetch(`/api/alerts/notifications?limit=${limit}`);
}

export async function markNotificationsRead(): Promise<void> {
  await apiFetch<unknown>("/api/alerts/notifications/read-all", { method: "PATCH" });
}

// ─── Organization & Billing (Phase 10) ────────────────────────────────────

export interface OrgData {
  organization: {
    id: string; name: string; slug: string; plan: string;
    members: Array<{ id: string; role: string; user: { id: string; name: string; email: string } }>;
  };
  role: string;
}

export async function fetchOrganization(): Promise<OrgData | null> {
  try { return await apiFetch<OrgData>("/api/org"); } catch { return null; }
}

export async function createOrganization(name: string): Promise<unknown> {
  return apiFetch("/api/org", { method: "POST", body: JSON.stringify({ name }) });
}

export interface BillingData {
  plan: string; status: string;
  limits: { maxServers: number; maxProjects: number; maxMembers: number; maxAiRequestsPerDay: number; maxDeploymentsPerMonth: number; maxApiKeys: number; features: string[] };
  usage: { servers: number; projects: number; members: number };
}

export async function fetchBilling(): Promise<BillingData | null> {
  try { return await apiFetch<BillingData>("/api/org/billing"); } catch { return null; }
}

export async function upgradePlan(plan: string): Promise<void> {
  await apiFetch<unknown>("/api/org/billing/upgrade", { method: "POST", body: JSON.stringify({ plan }) });
}

export async function inviteMember(email: string, role: string): Promise<unknown> {
  return apiFetch("/api/org/invitations", { method: "POST", body: JSON.stringify({ email, role }) });
}

export async function fetchInvitations(): Promise<any[]> {
  try { return await apiFetch<any[]>("/api/org/invitations"); } catch { return []; }
}

export async function acceptInvitation(token: string): Promise<void> {
  await apiFetch<unknown>(`/api/org/invitations/${token}/accept`, { method: "POST" });
}

export interface InvitationInfo {
  email: string;
  organizationName: string;
  role: string;
  status: string;
  expiresAt: string;
  expired: boolean;
}

export async function getInvitationInfo(token: string): Promise<InvitationInfo | null> {
  try {
    // This endpoint is public (no auth), but apiFetch adds token if available
    return await apiFetch<InvitationInfo>(`/api/org/invitations/${token}/info`);
  } catch { return null; }
}

export async function removeMember(userId: string): Promise<void> {
  await apiFetch<unknown>(`/api/org/members/${userId}`, { method: "DELETE" });
}

export async function updateMemberRole(userId: string, role: string): Promise<void> {
  await apiFetch<unknown>(`/api/org/members/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export async function fetchApiKeys(): Promise<any[]> {
  try { return await apiFetch<any[]>("/api/org/api-keys"); } catch { return []; }
}

export async function createApiKeyApi(name: string, permissions: string[]): Promise<any> {
  return apiFetch("/api/org/api-keys", { method: "POST", body: JSON.stringify({ name, permissions }) });
}

export async function revokeApiKeyApi(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/org/api-keys/${id}`, { method: "DELETE" });
}

export async function fetchAuditLogs(opts: { limit?: number } = {}): Promise<{ logs: any[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  try { return await apiFetch(`/api/org/audit?${params.toString()}`); } catch { return { logs: [], nextCursor: null }; }
}

// ─── Multi-Cloud Infrastructure ───────────────────────────────────────────

export interface InfraProvider {
  type: string;
  displayName: string;
  fields: Array<{ key: string; label: string; type: string; placeholder?: string; required: boolean; options?: string[] }>;
}

export interface InfraConnection {
  id: string; provider: string; name: string; status: string;
  region: string; lastSyncAt: string | null; lastError: string | null;
  resourceCount: number; createdAt: string;
}

export interface CloudResourceItem {
  id: string; provider: string; resourceType: string; resourceId: string;
  name: string; region: string; status: string; specs: any; metrics: any;
  tags: any; connectionName: string; lastSeenAt: string;
}

export async function fetchInfraProviders(): Promise<InfraProvider[]> {
  try { return await apiFetch<InfraProvider[]>("/api/infrastructure/providers"); } catch { return []; }
}

export async function fetchInfraConnections(): Promise<InfraConnection[]> {
  try { return await apiFetch<InfraConnection[]>("/api/infrastructure/connections"); } catch { return []; }
}

export async function fetchInfraResources(opts: { provider?: string; status?: string; limit?: number } = {}): Promise<{ resources: CloudResourceItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.provider) params.set("provider", opts.provider);
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  try { return await apiFetch(`/api/infrastructure/resources?${params}`); } catch { return { resources: [], nextCursor: null }; }
}

export async function fetchInfraSummary(): Promise<{ connections: number; providers: Record<string, { total: number; running: number; stopped: number }> }> {
  try { return await apiFetch("/api/infrastructure/summary"); } catch { return { connections: 0, providers: {} }; }
}

export async function connectInfraProvider(provider: string, name: string, credentials: Record<string, string>): Promise<any> {
  return apiFetch("/api/infrastructure/connect", { method: "POST", body: JSON.stringify({ provider, name, credentials }) });
}

export async function disconnectInfraProvider(connectionId: string): Promise<void> {
  await apiFetch<unknown>("/api/infrastructure/disconnect", { method: "POST", body: JSON.stringify({ connectionId }) });
}

export async function syncInfraConnection(connectionId: string): Promise<any> {
  return apiFetch(`/api/infrastructure/sync/${connectionId}`, { method: "POST" });
}

// ─── Razorpay Billing ─────────────────────────────────────────────────────

export interface CheckoutResponse {
  subscriptionId: string;
  orderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  planName: string;
}

export async function createBillingCheckout(plan: string): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/api/org/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

export async function verifyBillingPayment(data: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}): Promise<{ plan: string; message: string }> {
  return apiFetch("/api/org/billing/verify", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelBillingSubscription(): Promise<void> {
  await apiFetch<unknown>("/api/org/billing/cancel", { method: "POST" });
}

// ─── Password Reset ───────────────────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch<unknown>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  return apiFetch(`/api/auth/verify-reset-token/${token}`);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch<unknown>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

// ─── Profile Management ───────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  company: string;
  bio: string;
  createdAt: string;
  projectCount: number;
  serverCount: number;
  organizations: Array<{ id: string; name: string; slug: string; plan: string; role: string }>;
}

export async function fetchProfile(): Promise<UserProfile | null> {
  try { return await apiFetch<UserProfile>("/api/auth/profile"); }
  catch { return null; }
}

export async function updateProfile(data: {
  name?: string; avatarUrl?: string; company?: string; bio?: string;
}): Promise<any> {
  return apiFetch("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchSessions(): Promise<Array<{ id: string; userAgent: string; ipAddress: string; createdAt: string }>> {
  try { return await apiFetch("/api/auth/sessions"); }
  catch { return []; }
}

export async function logoutAllSessions(): Promise<void> {
  await apiFetch<unknown>("/api/auth/logout-all", { method: "POST" });
}
