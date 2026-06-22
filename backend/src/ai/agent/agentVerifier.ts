/**
 * agentVerifier.ts
 *
 * Verifies tool execution results and synthesizes a natural language response.
 * 
 * Pipeline:
 *  Tool results → DevOps Reasoner → LLM Enhancement (optional) → Final Response
 *
 * The DevOps Reasoner produces structured analysis (root cause, evidence,
 * recommendations). The LLM then polishes it into natural conversation.
 * If LLM is unavailable, the reasoner's structured output is formatted directly.
 */

import type { ExecutionPlan, ClassifiedIntent } from "./agentTypes";
import { analyzeToolResults, formatAnalysisAsResponse, type DevOpsAnalysis } from "./devopsReasoner";

// ─── Response synthesis ───────────────────────────────────────────────────

/**
 * synthesizeResponse
 *
 * Takes tool results and creates a natural language response.
 * Pipeline: Tool results → DevOps Reasoner → LLM polish (optional) → response
 */
export async function synthesizeResponse(
  plan: ExecutionPlan,
  history: Array<{ role: string; content: string }>,
  classified: ClassifiedIntent
): Promise<{ answer: string; sources: string[] }> {
  const toolResults = plan.steps
    .filter((s) => s.result?.success)
    .map((s) => ({
      tool: s.toolName,
      description: s.description,
      data: s.result!.data,
    }));

  const failedSteps = plan.steps.filter((s) => s.status === "failed");
  const sources: string[] = [];

  // Collect sources from tool metadata
  for (const step of plan.steps) {
    if (step.result?.metadata?.sources) {
      const stepSources = step.result.metadata.sources as string[];
      sources.push(...stepSources);
    }
    if (step.result?.success) {
      sources.push(`Tool: ${step.toolName}`);
    }
  }

  // ── Step 1: Run DevOps Reasoner for structured analysis ──────────────────
  const analysis = analyzeToolResults(plan, classified);

  // ── Step 2: Try LLM to polish the analysis into conversational response ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && (toolResults.length > 0 || analysis.missingData.length > 0)) {
    try {
      const answer = await llmSynthesizeWithReasoning(
        classified.query, toolResults, history, plan.mode, analysis
      );
      return { answer, sources: [...new Set(sources)] };
    } catch (err) {
      console.warn("[agentVerifier] LLM synthesis failed, using reasoner output:", err);
    }
  }

  // ── Step 3: Fallback — format the DevOps analysis directly ───────────────
  const answer = formatAnalysisAsResponse(analysis);
  return { answer, sources: [...new Set(sources)] };
}

// ─── LLM-based synthesis with DevOps reasoning ───────────────────────────

async function llmSynthesizeWithReasoning(
  query: string,
  toolResults: Array<{ tool: string; description: string; data: unknown }>,
  history: Array<{ role: string; content: string }>,
  mode: "analyst" | "executor",
  analysis: DevOpsAnalysis
): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are a senior DevOps engineer working as Unwire AI's infrastructure assistant.
You think and communicate like an experienced engineer who has seen thousands of production incidents.

CRITICAL RULES:
- Speak conversationally, like a senior engineer explaining to a colleague
- NEVER just list raw metrics. Always explain what they MEAN and WHY they matter.
- Reference specific numbers as evidence but always provide context
- If something is wrong, explain the likely root cause and what to do about it
- If everything is healthy, say so concisely — don't over-explain
- Use "your" when talking about the user's infrastructure
- Be direct and actionable. No filler words.
- Structure: Summary → Evidence → Cause → Recommendation
- If data is missing, explain what it means and what the user should do

BAD response: "CPU: 80%. RAM: 60%. Health: 40/100. 1 server found."
GOOD response: "Your API server is under significant CPU pressure at 80%, which explains the slow response times. This level of sustained load typically indicates either a traffic spike or an inefficient query. I'd recommend checking your database query times first."

Mode: ${mode === "analyst" ? "ANALYST — explain and recommend, do not take action" : "EXECUTOR — action was taken, report what happened"}`;

  // Build structured context from the DevOps analysis
  let reasoningContext = `\n--- DevOps Analysis (pre-computed) ---\n`;
  reasoningContext += `Severity: ${analysis.severity}\n`;
  reasoningContext += `Summary: ${analysis.summary}\n`;
  if (analysis.rootCause) reasoningContext += `Root Cause: ${analysis.rootCause}\n`;
  if (analysis.evidence.length > 0) reasoningContext += `Evidence: ${analysis.evidence.join("; ")}\n`;
  if (analysis.recommendations.length > 0) reasoningContext += `Recommendations: ${analysis.recommendations.join("; ")}\n`;
  if (analysis.missingData.length > 0) reasoningContext += `Missing Data: ${analysis.missingData.join("; ")}\n`;

  // Also include raw tool data for the LLM to reference specific numbers
  const toolContext = toolResults.map((r) => {
    const dataStr = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
    return `--- Tool: ${r.tool} ---\n${dataStr.slice(0, 1500)}`;
  }).join("\n\n");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  // Add recent conversation history (last 4 messages)
  for (const msg of history.slice(-4)) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }

  messages.push({
    role: "user",
    content: `${reasoningContext}\n\n${toolContext}\n\n---\n\nUser question: ${query}\n\nRespond as a senior DevOps engineer. Be specific, reference the data, and explain root causes.`,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 1024,
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content?.trim() ?? formatAnalysisAsResponse(analysis);
}

// ─── Verification of action results ───────────────────────────────────────

/**
 * verifyActionResult
 *
 * After an action is executed, verifies the result is as expected.
 * Returns a verification summary.
 */
export function verifyActionResult(plan: ExecutionPlan): {
  allSucceeded: boolean;
  summary: string;
} {
  const total = plan.steps.length;
  const succeeded = plan.steps.filter((s) => s.status === "success").length;
  const failed = plan.steps.filter((s) => s.status === "failed").length;
  const skipped = plan.steps.filter((s) => s.status === "skipped").length;

  const allSucceeded = failed === 0 && skipped === 0;

  let summary: string;
  if (allSucceeded) {
    summary = `✅ All ${total} step(s) completed successfully.`;
  } else if (failed > 0) {
    summary = `⚠️ ${failed}/${total} step(s) failed. ${succeeded} succeeded, ${skipped} skipped.`;
  } else {
    summary = `${succeeded}/${total} step(s) completed. ${skipped} skipped.`;
  }

  return { allSucceeded, summary };
}
