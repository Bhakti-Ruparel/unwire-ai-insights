/**
 * agentController.ts
 *
 * HTTP controller for the AI DevOps Agent.
 * Handles the global agent chat endpoint used by the GlobalAIAgent UI.
 *
 * Endpoints:
 *  - POST /api/agent/chat   → Process agent message
 *  - GET  /api/agent/health → Agent service health check
 */

import type { Request, Response } from "express";
import { handleAgentMessage } from "../ai/agent/agentOrchestrator";

// ─── POST /api/agent/chat ─────────────────────────────────────────────────

export async function agentChat(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required." });
      return;
    }

    const { message, sessionId } = req.body as { message?: string; sessionId?: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ success: false, error: "Message is required." });
      return;
    }

    const result = await handleAgentMessage(userId, message.trim(), sessionId);

    // Map to the format expected by the frontend
    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        sessionId: result.sessionId,
        intent: result.intent,
        mode: result.mode,
        toolsUsed: result.toolsUsed,
        requiresApproval: result.requiresApproval,
        approvalMessage: result.approvalMessage,
      },
    });
  } catch (err) {
    console.error("[agentChat]", err);
    res.status(500).json({ success: false, error: "Failed to process agent message." });
  }
}

// ─── GET /api/agent/health ────────────────────────────────────────────────

export async function agentHealth(_req: Request, res: Response): Promise<void> {
  try {
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    res.json({
      success: true,
      data: {
        status: "operational",
        llmAvailable: hasOpenAI,
        capabilities: [
          "intent_classification",
          "server_metrics",
          "log_analysis",
          "deployment_management",
          "project_context",
          "codebase_search",
          "file_reading",
          "git_operations",
          "approval_workflow",
        ],
      },
    });
  } catch {
    res.status(500).json({ success: false, error: "Agent health check failed." });
  }
}
