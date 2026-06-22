/**
 * agentPlanner.ts
 *
 * Creates execution plans based on classified intent.
 * Maps intents + entities → ordered list of tool invocations.
 *
 * Two modes:
 *  - "analyst": Read-only tools, returns explanation
 *  - "executor": Action tools with approval workflow
 */

import { randomUUID } from "crypto";
import type {
  ClassifiedIntent,
  ExecutionPlan,
  PlanStep,
  IntentCategory,
} from "./agentTypes";

// ─── Tool selection by category ───────────────────────────────────────────

const CATEGORY_TOOL_MAP: Record<IntentCategory, string[]> = {
  server_metrics:     ["server_metrics", "logs_search"],
  server_health:      ["infrastructure_health", "server_metrics", "logs_search"],
  log_analysis:       ["logs_search", "server_metrics"],
  deployment:         ["deployment_history", "project_context", "deployment"],
  project_context:    ["project_context", "codebase_search"],
  codebase:           ["codebase_search", "file_reader", "project_context"],
  git_operations:     ["git_tool", "codebase_search"],
  service_management: ["infrastructure_health", "server_metrics", "logs_search", "deployment"],
  general:            ["infrastructure_health", "server_metrics"],
};

// ─── Broad investigation patterns ─────────────────────────────────────────
// Questions that require gathering data from multiple tools simultaneously

const BROAD_INVESTIGATION_PATTERNS = [
  /why.*(slow|lag|hang|timeout|unresponsive|down|crash|fail|broke|break)/i,
  /what.*(?:wrong|issue|problem|happened|causing)/i,
  /diagnose|investigate|troubleshoot|root\s?cause/i,
  /not\s+(?:working|responding|loading|connecting)/i,
  /keep.*(?:crash|restart|fail|die|stop)/i,
  /performance\s*(?:issue|problem|degrad)/i,
];

const BROAD_INVESTIGATION_TOOLS = [
  "server_metrics",
  "logs_search",
  "deployment_history",
  "incident_analysis",
];

// ─── Tools that require approval ──────────────────────────────────────────

const APPROVAL_TOOLS = new Set([
  "deployment",
  "git_tool",
  "remediation",
]);

// ─── Plan creation ────────────────────────────────────────────────────────

/**
 * createPlan
 *
 * Generates an execution plan for the classified intent.
 * For "info" intents → analyst mode (read-only).
 * For "action" intents → executor mode (may require approval).
 */
export function createPlan(classified: ClassifiedIntent): ExecutionPlan {
  const mode = classified.intent === "info" ? "analyst" : "executor";
  const toolNames = selectTools(classified);
  const steps = buildSteps(toolNames, classified);

  // Determine if approval is needed
  const needsApproval = mode === "executor" && (
    classified.requiresApproval ||
    steps.some((s) => APPROVAL_TOOLS.has(s.toolName))
  );

  const approvalMessage = needsApproval
    ? buildApprovalMessage(classified, steps)
    : undefined;

  return {
    id: randomUUID(),
    intent: classified,
    mode,
    steps,
    requiresApproval: needsApproval,
    approvalMessage,
    createdAt: new Date().toISOString(),
  };
}

// ─── Tool selection ───────────────────────────────────────────────────────

function selectTools(classified: ClassifiedIntent): string[] {
  const baseTools = CATEGORY_TOOL_MAP[classified.category] ?? CATEGORY_TOOL_MAP.general;
  const tools: string[] = [];

  // Check if this is a broad investigation question
  const isBroadInvestigation = BROAD_INVESTIGATION_PATTERNS.some((p) => p.test(classified.query));

  if (isBroadInvestigation) {
    // For broad questions like "why is my app slow?" — gather all evidence
    for (const tool of BROAD_INVESTIGATION_TOOLS) {
      tools.push(tool);
    }
    // Also add category-specific tools that aren't already included
    for (const tool of baseTools) {
      if (!tools.includes(tool) && !APPROVAL_TOOLS.has(tool)) {
        tools.push(tool);
      }
    }
  } else {
    // Standard: use category-based tools
    for (const tool of baseTools) {
      if (classified.intent === "info" && APPROVAL_TOOLS.has(tool)) {
        // Skip write tools for info intents — use read equivalents
        if (tool === "deployment") tools.push("deployment_history");
        continue;
      }
      tools.push(tool);
    }
  }

  // Deduplicate
  return [...new Set(tools)];
}

// ─── Step building ────────────────────────────────────────────────────────

function buildSteps(toolNames: string[], classified: ClassifiedIntent): PlanStep[] {
  const steps: PlanStep[] = [];

  // For broad investigation, tools are independent (no dependencies)
  const isBroadInvestigation = BROAD_INVESTIGATION_PATTERNS.some((p) => p.test(classified.query));

  let prevId: string | undefined;

  for (let i = 0; i < toolNames.length; i++) {
    const toolName = toolNames[i];
    const stepId = randomUUID();

    const step: PlanStep = {
      id: stepId,
      order: i + 1,
      toolName,
      description: getToolDescription(toolName, classified),
      input: buildToolInput(toolName, classified),
      // Broad investigation: no dependencies (gather all in parallel)
      // Standard flow: sequential with dependencies
      dependsOn: (!isBroadInvestigation && prevId) ? [prevId] : undefined,
      status: "pending",
    };

    steps.push(step);
    prevId = stepId;
  }

  return steps;
}

// ─── Tool descriptions ────────────────────────────────────────────────────

function getToolDescription(toolName: string, classified: ClassifiedIntent): string {
  const descMap: Record<string, string> = {
    server_metrics:        "Fetch server metrics and health data",
    logs_search:           "Search and analyze server logs",
    project_context:       "Load project information and context",
    deployment_history:    "Retrieve deployment history and status",
    codebase_search:       "Search codebase for relevant code",
    file_reader:           "Read specific project files",
    git_tool:              "Execute git operations",
    deployment:            "Execute deployment actions",
    infrastructure_health: "Complete infrastructure health analysis",
    incident_analysis:     "Deep-dive root cause analysis",
    remediation:           "Execute approved remediation action",
  };
  return descMap[toolName] ?? `Execute ${toolName}`;
}

// ─── Tool input construction ──────────────────────────────────────────────

function buildToolInput(toolName: string, classified: ClassifiedIntent): Record<string, unknown> {
  const input: Record<string, unknown> = {
    query: classified.query,
  };

  // Add entity-specific inputs
  if (classified.entities.servers?.length) {
    input.serverName = classified.entities.servers[0];
  }
  if (classified.entities.projects?.length) {
    input.projectName = classified.entities.projects[0];
  }
  if (classified.entities.timeRange) {
    input.timeRange = classified.entities.timeRange;
  }
  if (classified.entities.apps?.length) {
    input.appName = classified.entities.apps[0];
  }
  if (classified.entities.files?.length) {
    input.filePath = classified.entities.files[0];
  }
  if (classified.entities.branches?.length) {
    input.branch = classified.entities.branches[0];
  }

  return input;
}

// ─── Approval message ─────────────────────────────────────────────────────

function buildApprovalMessage(classified: ClassifiedIntent, steps: PlanStep[]): string {
  const actionSteps = steps
    .filter((s) => APPROVAL_TOOLS.has(s.toolName) || classified.requiresApproval)
    .map((s, i) => `${i + 1}. ${s.description}`);

  const header = `I've analyzed the request and prepared an action plan:\n\n`;
  const stepsList = actionSteps.length > 0
    ? `**Proposed steps:**\n${actionSteps.join("\n")}\n\n`
    : "";
  const footer = `Would you like me to proceed? (Reply **yes** to approve or **no** to cancel)`;

  return header + stepsList + footer;
}
