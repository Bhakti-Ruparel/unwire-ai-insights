/**
 * agentTypes.ts
 *
 * Shared type definitions for the AI DevOps Agent architecture.
 * These types are used across the intent classifier, planner, tool executor,
 * memory, and verifier modules.
 */

// ─── Tool Result ──────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ─── Intent Classification ────────────────────────────────────────────────

export type AgentIntent = "info" | "action";

export interface ClassifiedIntent {
  intent: AgentIntent;
  confidence: number;          // 0–1
  query: string;
  category: IntentCategory;
  entities: ExtractedEntities;
  requiresApproval: boolean;
}

export type IntentCategory =
  | "server_metrics"
  | "server_health"
  | "log_analysis"
  | "deployment"
  | "project_context"
  | "codebase"
  | "git_operations"
  | "service_management"
  | "general";

export interface ExtractedEntities {
  servers?: string[];
  apps?: string[];
  projects?: string[];
  metrics?: string[];
  timeRange?: string;
  files?: string[];
  branches?: string[];
}

// ─── Execution Plan ───────────────────────────────────────────────────────

export interface ExecutionPlan {
  id: string;
  intent: ClassifiedIntent;
  mode: "analyst" | "executor";
  steps: PlanStep[];
  requiresApproval: boolean;
  approvalMessage?: string;
  createdAt: string;
}

export interface PlanStep {
  id: string;
  order: number;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
  dependsOn?: string[];         // step IDs this depends on
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: ToolResult;
}

// ─── Tool Definition ──────────────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  category: "read" | "write" | "execute";
  requiresApproval: boolean;
  execute: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  sessionId: string;
  serverId?: string;
  projectId?: string;
}

// ─── Agent Memory ─────────────────────────────────────────────────────────

export interface AgentMemoryEntry {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  metadata?: {
    intent?: AgentIntent;
    toolsUsed?: string[];
    planId?: string;
  };
}

export interface AgentSession {
  id: string;
  userId: string;
  messages: AgentMemoryEntry[];
  context: SessionContext;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionContext {
  recentServers?: string[];
  recentProjects?: string[];
  lastIntent?: AgentIntent;
  pendingApproval?: PendingApproval;
}

// ─── Approval Workflow ────────────────────────────────────────────────────

export interface PendingApproval {
  planId: string;
  action: string;
  description: string;
  steps: string[];
  createdAt: string;
  expiresAt: string;
}

// ─── Agent Response ───────────────────────────────────────────────────────

export interface AgentResponse {
  answer: string;
  intent: AgentIntent;
  mode: "analyst" | "executor";
  sources: string[];
  toolsUsed: string[];
  plan?: ExecutionPlan;
  requiresApproval: boolean;
  approvalMessage?: string;
  sessionId: string;
}
