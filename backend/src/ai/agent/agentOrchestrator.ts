/**
 * agentOrchestrator.ts
 *
 * Main orchestrator for the AI DevOps Agent.
 * This is the single entry point that coordinates:
 *  1. Intent classification
 *  2. Plan creation
 *  3. Approval workflow
 *  4. Tool execution
 *  5. Response synthesis
 *  6. Memory persistence
 *
 * Flow:
 *  User message → classify → plan → (approve?) → execute → verify → respond
 */

import { classifyIntent, isApprovalResponse } from "./intentClassifier";
import { createPlan } from "./agentPlanner";
import { executePlan } from "./toolExecutor";
import { synthesizeResponse, verifyActionResult } from "./agentVerifier";
import {
  getOrCreateSession,
  addMessage,
  updateContext,
  setPendingApproval,
  getPendingApproval,
  clearPendingApproval,
  getConversationHistory,
  ensureAgentProject,
} from "./agentMemory";
import type { AgentResponse, AgentSession, ToolContext } from "./agentTypes";

// ─── Register all tools (side-effect imports) ─────────────────────────────

import "../tools/serverMetricsTool";
import "../tools/logsSearchTool";
import "../tools/projectContextTool";
import "../tools/deploymentHistoryTool";
import "../tools/codebaseSearchTool";
import "../tools/fileReaderTool";
import "../tools/gitTool";
import "../tools/deploymentTool";
import "../tools/infrastructureHealthTool";
import "../tools/incidentAnalysisTool";
import "../tools/remediationTool";
import "../tools/cloudInfrastructureTool";

// ─── Main agent entry point ───────────────────────────────────────────────

/**
 * handleAgentMessage
 *
 * Processes a user message through the full agent pipeline.
 * Returns a structured response with answer, tools used, and approval status.
 */
export async function handleAgentMessage(
  userId: string,
  message: string,
  sessionId?: string
): Promise<AgentResponse> {
  // ── 1. Ensure agent project exists for session storage ──────────────────
  await ensureAgentProject(userId);

  // ── 2. Get or create session ────────────────────────────────────────────
  const session = await getOrCreateSession(sessionId, userId);

  // ── 3. Persist user message ─────────────────────────────────────────────
  await addMessage(session, {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  // ── 4. Check for pending approval response ──────────────────────────────
  const pendingApproval = getPendingApproval(session);
  if (pendingApproval) {
    const approvalResult = isApprovalResponse(message);
    if (approvalResult === "approve") {
      return await executeApprovedPlan(session, userId);
    } else if (approvalResult === "reject") {
      return rejectPlan(session);
    }
    // If not a clear approve/reject, treat as new query and clear pending
    clearPendingApproval(session);
  }

  // ── 5. Classify intent ──────────────────────────────────────────────────
  const classified = classifyIntent(message);

  // ── 6. Create execution plan ────────────────────────────────────────────
  const plan = createPlan(classified);

  // ── 7. Build tool context ───────────────────────────────────────────────
  const toolContext: ToolContext = {
    userId,
    sessionId: session.id,
  };

  // ── 8. Check approval requirement ──────────────────────────────────────
  if (plan.requiresApproval && plan.mode === "executor") {
    // Store the plan and ask for approval
    setPendingApproval(
      session,
      plan.id,
      classified.category,
      plan.approvalMessage ?? "Action requires approval.",
      plan.steps.map((s) => s.description)
    );

    // Store plan in session for later execution
    (session as any)._pendingPlan = plan;
    (session as any)._pendingToolContext = toolContext;

    const approvalResponse: AgentResponse = {
      answer: plan.approvalMessage ?? "This action requires your approval before I can proceed.",
      intent: classified.intent,
      mode: plan.mode,
      sources: [],
      toolsUsed: [],
      plan,
      requiresApproval: true,
      approvalMessage: plan.approvalMessage,
      sessionId: session.id,
    };

    await addMessage(session, {
      role: "assistant",
      content: approvalResponse.answer,
      timestamp: new Date().toISOString(),
      metadata: { intent: classified.intent, planId: plan.id },
    });

    return approvalResponse;
  }

  // ── 9. Execute plan (analyst mode or approved action) ──────────────────
  const executedPlan = await executePlan(plan, toolContext);

  // ── 10. Synthesize response ────────────────────────────────────────────
  const history = getConversationHistory(session);
  const { answer, sources } = await synthesizeResponse(executedPlan, history, classified);

  // ── 11. Verify results (for action plans) ──────────────────────────────
  let finalAnswer = answer;
  if (plan.mode === "executor") {
    const verification = verifyActionResult(executedPlan);
    if (!verification.allSucceeded) {
      finalAnswer += `\n\n${verification.summary}`;
    }
  }

  // ── 12. Update session context ─────────────────────────────────────────
  updateContext(session, {
    lastIntent: classified.intent,
    recentServers: classified.entities.servers,
    recentProjects: classified.entities.projects,
  });

  // ── 13. Persist assistant message ──────────────────────────────────────
  const toolsUsed = executedPlan.steps
    .filter((s) => s.status === "success")
    .map((s) => s.toolName);

  await addMessage(session, {
    role: "assistant",
    content: finalAnswer,
    timestamp: new Date().toISOString(),
    metadata: {
      intent: classified.intent,
      toolsUsed,
      planId: plan.id,
    },
  });

  return {
    answer: finalAnswer,
    intent: classified.intent,
    mode: plan.mode,
    sources,
    toolsUsed,
    requiresApproval: false,
    sessionId: session.id,
  };
}

// ─── Execute approved plan ────────────────────────────────────────────────

async function executeApprovedPlan(
  session: AgentSession,
  userId: string
): Promise<AgentResponse> {
  clearPendingApproval(session);

  const plan = (session as any)._pendingPlan;
  const toolContext: ToolContext = (session as any)._pendingToolContext ?? {
    userId,
    sessionId: session.id,
  };

  if (!plan) {
    return {
      answer: "No pending action to approve. What would you like me to do?",
      intent: "info",
      mode: "analyst",
      sources: [],
      toolsUsed: [],
      requiresApproval: false,
      sessionId: session.id,
    };
  }

  // Clear stored plan
  delete (session as any)._pendingPlan;
  delete (session as any)._pendingToolContext;

  // Execute
  const executedPlan = await executePlan(plan, toolContext);
  const history = getConversationHistory(session);
  const { answer, sources } = await synthesizeResponse(executedPlan, history, plan.intent);

  const verification = verifyActionResult(executedPlan);
  const finalAnswer = verification.allSucceeded
    ? `✅ Action approved and executed.\n\n${answer}`
    : `${answer}\n\n${verification.summary}`;

  const toolsUsed = executedPlan.steps
    .filter((s) => s.status === "success")
    .map((s) => s.toolName);

  await addMessage(session, {
    role: "assistant",
    content: finalAnswer,
    timestamp: new Date().toISOString(),
    metadata: { intent: plan.intent.intent, toolsUsed, planId: plan.id },
  });

  return {
    answer: finalAnswer,
    intent: plan.intent.intent,
    mode: plan.mode,
    sources,
    toolsUsed,
    requiresApproval: false,
    sessionId: session.id,
  };
}

// ─── Reject plan ──────────────────────────────────────────────────────────

function rejectPlan(session: AgentSession): AgentResponse {
  clearPendingApproval(session);
  delete (session as any)._pendingPlan;
  delete (session as any)._pendingToolContext;

  const answer = "Understood — action cancelled. Let me know if there's anything else I can help with.";

  addMessage(session, {
    role: "assistant",
    content: answer,
    timestamp: new Date().toISOString(),
  });

  return {
    answer,
    intent: "info",
    mode: "analyst",
    sources: [],
    toolsUsed: [],
    requiresApproval: false,
    sessionId: session.id,
  };
}
