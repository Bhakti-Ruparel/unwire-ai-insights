/**
 * intentClassifier.ts
 *
 * Enhanced intent classification for the AI DevOps Agent.
 * Classifies user messages into intents and categories using:
 *  1. Pattern-based heuristics (fast, no API call)
 *  2. LLM-based classification (accurate, used for ambiguous cases)
 *
 * Determines:
 *  - intent: "info" vs "action"
 *  - category: what domain the query falls into
 *  - requiresApproval: whether the action needs user confirmation
 *  - entities: extracted server/project/app references
 */

import type { ClassifiedIntent, IntentCategory, ExtractedEntities, AgentIntent } from "./agentTypes";

// ─── Action verbs that indicate modification intent ───────────────────────

const ACTION_VERBS = new Set([
  "fix", "deploy", "restart", "optimize", "update", "install", "create",
  "delete", "remove", "change", "modify", "solve", "patch", "upgrade",
  "scale", "migrate", "rollback", "stop", "start", "kill", "configure",
  "refactor", "revert", "rebuild", "redeploy", "push", "pull", "merge",
  "reset", "clear", "flush", "terminate", "provision", "teardown",
]);

// ─── High-risk actions that always require approval ───────────────────────

const APPROVAL_REQUIRED_VERBS = new Set([
  "deploy", "delete", "remove", "restart", "stop", "kill",
  "rollback", "migrate", "revert", "terminate", "teardown",
  "push", "merge", "redeploy", "modify", "change", "fix",
]);

// ─── Info-seeking patterns ────────────────────────────────────────────────

const INFO_PATTERNS = [
  /^(why|what|how|when|where|which|who|is|are|does|do|can|show|list|explain|describe|tell|give|find|check|look|get|see)/i,
  /\?$/,
  /status|health|usage|trend|history|recent|current|overview|summary|report/i,
  /^(analyze|analyse|diagnose|investigate|examine|review|compare|monitor)/i,
];

// ─── Category detection patterns ──────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: IntentCategory }> = [
  { pattern: /cpu|ram|memory|disk|network|bandwidth|load|metric|performance|slow|resource/i, category: "server_metrics" },
  { pattern: /health|status|online|offline|up|down|alive|dead|connectivity|ping/i, category: "server_health" },
  { pattern: /log|error|warn|exception|trace|debug|crash|issue|bug|stack\s?trace/i, category: "log_analysis" },
  { pattern: /deploy|rollback|release|build|pipeline|ci\/?cd|docker|container|kubernetes|helm/i, category: "deployment" },
  { pattern: /project|api|endpoint|route|dependency|package|schema|database|model/i, category: "project_context" },
  { pattern: /code|file|function|class|module|import|refactor|lint|format/i, category: "codebase" },
  { pattern: /git|commit|branch|merge|pull\s?request|pr|diff|changelog/i, category: "git_operations" },
  { pattern: /service|app|process|restart|nginx|pm2|systemd|docker|container/i, category: "service_management" },
];

// ─── Entity extraction ────────────────────────────────────────────────────

function extractEntities(query: string): ExtractedEntities {
  const entities: ExtractedEntities = {};
  const lq = query.toLowerCase();

  // Server references
  const serverMatch = lq.match(
    /(?:server|vps|instance|machine|host|node)\s*(?:["']([^"']+)["']|(\w[\w-]*))?/g
  );
  if (serverMatch) {
    entities.servers = serverMatch.map((m) => m.replace(/(?:server|vps|instance|machine|host|node)\s*/i, "").trim()).filter(Boolean);
  }

  // App references
  const appPatterns = lq.match(
    /(?:n8n|postgres(?:ql)?|redis|nginx|node|next|react|mongodb|mysql|api|backend|frontend|pm2|docker|express|flask|django)/gi
  );
  if (appPatterns) entities.apps = [...new Set(appPatterns)];

  // Metric references
  const metricPatterns = lq.match(/(?:cpu|ram|memory|disk|network|load|bandwidth|io|iops)/gi);
  if (metricPatterns) entities.metrics = [...new Set(metricPatterns)];

  // Time range
  const timeMatch = lq.match(/(?:last|past|recent)\s*(\d+)\s*(minute|hour|day|week|month|m|h|d|w)s?/i);
  if (timeMatch) entities.timeRange = `${timeMatch[1]}${timeMatch[2][0]}`;

  // File references
  const fileMatch = query.match(/(?:[\w/.]+\.\w{1,5})/g);
  if (fileMatch) entities.files = fileMatch.filter((f) => f.includes(".") && !f.startsWith("http"));

  // Branch references
  const branchMatch = lq.match(/(?:branch|on)\s+(?:["']([^"']+)["']|(\w[\w/-]*))/);
  if (branchMatch) entities.branches = [(branchMatch[1] || branchMatch[2])];

  return entities;
}

// ─── Main classifier ──────────────────────────────────────────────────────

export function classifyIntent(query: string): ClassifiedIntent {
  const lq = query.toLowerCase().trim();
  const words = lq.split(/\s+/);

  // ── Score calculation ─────────────────────────────────────────────────────
  let actionScore = 0;
  let infoScore = 0;

  // Check for action verbs
  for (const word of words) {
    if (ACTION_VERBS.has(word)) actionScore += 0.35;
  }

  // First word is an action verb → strong signal
  if (ACTION_VERBS.has(words[0])) actionScore += 0.3;

  // "please" / "can you" + action verb → action
  if (/(?:please|can you|could you|i want|i need|go ahead)/i.test(lq)) {
    actionScore += 0.1;
  }

  // Info patterns
  for (const pattern of INFO_PATTERNS) {
    if (pattern.test(lq)) infoScore += 0.25;
  }

  // Approval handling for responses to pending approvals
  if (/^(yes|approve|confirm|go ahead|do it|proceed|ok|sure|y)$/i.test(lq)) {
    actionScore += 0.8;
  }
  if (/^(no|reject|cancel|abort|stop|don't|nope|n)$/i.test(lq)) {
    infoScore += 0.8;
  }

  // ── Determine intent ──────────────────────────────────────────────────────
  const intent: AgentIntent = actionScore > infoScore ? "action" : "info";
  const confidence = Math.min(1, Math.max(0.5, Math.abs(actionScore - infoScore) + 0.5));

  // ── Detect category ───────────────────────────────────────────────────────
  let category: IntentCategory = "general";
  for (const { pattern, category: cat } of CATEGORY_PATTERNS) {
    if (pattern.test(lq)) {
      category = cat;
      break;
    }
  }

  // ── Check if approval required ────────────────────────────────────────────
  let requiresApproval = false;
  if (intent === "action") {
    for (const word of words) {
      if (APPROVAL_REQUIRED_VERBS.has(word)) {
        requiresApproval = true;
        break;
      }
    }
  }

  // ── Extract entities ──────────────────────────────────────────────────────
  const entities = extractEntities(query);

  return {
    intent,
    confidence,
    query,
    category,
    entities,
    requiresApproval,
  };
}

/**
 * isApprovalResponse
 *
 * Checks if a user message is a response to a pending approval.
 */
export function isApprovalResponse(query: string): "approve" | "reject" | null {
  const lq = query.toLowerCase().trim();
  if (/^(yes|approve|confirm|go ahead|do it|proceed|ok|sure|y|accepted|let'?s do it)$/i.test(lq)) {
    return "approve";
  }
  if (/^(no|reject|cancel|abort|stop|don'?t|nope|n|denied|skip)$/i.test(lq)) {
    return "reject";
  }
  return null;
}
