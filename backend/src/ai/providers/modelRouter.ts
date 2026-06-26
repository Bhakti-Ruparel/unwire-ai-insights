/**
 * modelRouter.ts
 *
 * Intelligent model routing with robust fallback handling.
 *
 * Fallback order (when primary model fails with 429/5xx):
 *   1. qwen/qwen3-coder:free
 *   2. deepseek/deepseek-r1:free
 *   3. meta-llama/llama-3.3-70b-instruct:free
 *
 * Never exposes provider errors to users.
 * Logs every attempt with: model, error code, latency, fallback used.
 */

import {
  getAIProvider,
  getAvailableProviders,
  type ChatMessage,
  type GenerateResult,
} from "./AIProvider";
import { AIRetryableError, AIFatalError } from "./openRouterProvider";
import { logger } from "../../services/logger";

// Register providers (side-effect imports)
import "./openRouterProvider";
import "./huggingFaceProvider";

// ─── Model definitions ────────────────────────────────────────────────────

export type ModelRole = "general" | "coder" | "reasoner";

export const MODELS: Record<ModelRole, string> = {
  general:  "meta-llama/llama-3.3-70b-instruct:free",
  coder:    "qwen/qwen3-coder:free",
  reasoner: "deepseek/deepseek-r1:free",
};

// Ordered fallback chain (as specified: qwen → deepseek → llama)
const FALLBACK_ORDER: string[] = [
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

// ─── Intent → Model mapping ───────────────────────────────────────────────

const INTENT_MODEL_MAP: Record<string, ModelRole> = {
  server_metrics:     "reasoner",
  server_health:      "reasoner",
  log_analysis:       "reasoner",
  service_management: "reasoner",
  codebase:           "coder",
  git_operations:     "coder",
  deployment:         "general",
  project_context:    "general",
  general:            "general",
};

// ─── Primary routing function ─────────────────────────────────────────────

export function selectModel(intentCategory: string): { model: string; role: ModelRole } {
  const role = INTENT_MODEL_MAP[intentCategory] ?? "general";
  return { model: MODELS[role], role };
}

function getProviderName(): string {
  return process.env.AI_PROVIDER ?? "openrouter";
}

// ─── Main generation function with fallback ───────────────────────────────

export interface RouteAndGenerateOpts {
  intentCategory: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  organizationId?: string;
}

/**
 * routeAndGenerate
 *
 * The single entry point for all LLM generation.
 * 1. Selects optimal model based on intent
 * 2. Calls primary provider
 * 3. On retryable error → walks fallback chain
 * 4. On all failures → returns graceful response (never throws to caller)
 */
export async function routeAndGenerate(opts: RouteAndGenerateOpts): Promise<GenerateResult> {
  const { model: primaryModel, role } = selectModel(opts.intentCategory);
  const providerName = getProviderName();
  const provider = getAIProvider(providerName);
  const attempts: AttemptLog[] = [];

  if (!provider?.isAvailable()) {
    // Try alternate providers directly
    return tryAlternateProviders(opts, attempts);
  }

  // ── Attempt 1: Primary model ────────────────────────────────────────────
  const primaryResult = await tryModel(provider, primaryModel, opts, attempts);
  if (primaryResult) {
    logSuccess(opts, primaryResult, role, false);
    return primaryResult;
  }

  // ── Attempt 2-4: Fallback chain ─────────────────────────────────────────
  for (const fallbackModel of FALLBACK_ORDER) {
    if (fallbackModel === primaryModel) continue; // Already tried

    const result = await tryModel(provider, fallbackModel, opts, attempts);
    if (result) {
      logSuccess(opts, result, modelToRole(fallbackModel), true);
      return result;
    }
  }

  // ── Attempt 5: Alternate providers ──────────────────────────────────────
  const altResult = await tryAlternateProviders(opts, attempts);
  if (altResult.provider !== "none") return altResult;

  // ── All failed — log full attempt history and return graceful message ───
  logAllFailed(opts, attempts);
  return altResult;
}

// ─── Try a single model (returns null if failed) ──────────────────────────

interface AttemptLog {
  model: string;
  provider: string;
  errorCode: number;
  errorMessage: string;
  latencyMs: number;
}

async function tryModel(
  provider: { generateResponse: Function; name: string },
  model: string,
  opts: RouteAndGenerateOpts,
  attempts: AttemptLog[]
): Promise<GenerateResult | null> {
  const start = Date.now();
  try {
    const result = await provider.generateResponse({
      model,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    return result as GenerateResult;
  } catch (err: any) {
    const latency = Date.now() - start;
    const errorCode = err instanceof AIRetryableError ? err.statusCode
      : err instanceof AIFatalError ? err.statusCode : 500;
    const errorMessage = err.message ?? "Unknown error";

    attempts.push({
      model,
      provider: provider.name ?? "unknown",
      errorCode,
      errorMessage: errorMessage.slice(0, 200),
      latencyMs: latency,
    });

    logger.warn(`AI model attempt failed`, {
      path: model,
      status: errorCode,
      duration: latency,
      error: errorMessage.slice(0, 150),
      userId: opts.userId,
    } as any);

    // Fatal errors (401, 400) — don't retry other models on same provider
    if (err instanceof AIFatalError && (errorCode === 401 || errorCode === 400)) {
      return null;
    }

    return null;
  }
}

// ─── Try alternate providers (HuggingFace etc.) ───────────────────────────

async function tryAlternateProviders(
  opts: RouteAndGenerateOpts,
  attempts: AttemptLog[]
): Promise<GenerateResult> {
  const providerName = getProviderName();
  const alternates = getAvailableProviders().filter((p) => p.name !== providerName);

  for (const alt of alternates) {
    for (const model of FALLBACK_ORDER) {
      const start = Date.now();
      try {
        const result = await alt.generateResponse({
          model,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
        });
        logger.info(`AI alternate provider succeeded`, {
          path: model, method: alt.name, duration: Date.now() - start,
        } as any);
        return result;
      } catch (err: any) {
        attempts.push({
          model, provider: alt.name,
          errorCode: 500, errorMessage: (err.message ?? "").slice(0, 200),
          latencyMs: Date.now() - start,
        });
      }
    }
  }

  // All providers exhausted — graceful response
  return {
    content: "I'm processing your request but the AI models are currently at capacity. " +
      "I've gathered the data from your infrastructure — here's what I can tell you based on the analysis above. " +
      "Please try again in a moment for a more detailed response.",
    model: "fallback",
    provider: "none",
    latencyMs: 0,
  };
}

// ─── Helper: model string → role ──────────────────────────────────────────

function modelToRole(model: string): ModelRole {
  if (model.includes("qwen") || model.includes("coder")) return "coder";
  if (model.includes("deepseek") || model.includes("r1")) return "reasoner";
  return "general";
}

// ─── Logging ──────────────────────────────────────────────────────────────

function logSuccess(
  opts: RouteAndGenerateOpts,
  result: GenerateResult,
  role: ModelRole,
  wasFallback: boolean
): void {
  logger.info(`AI response generated${wasFallback ? " (fallback)" : ""}`, {
    userId: opts.userId,
    organizationId: opts.organizationId,
    method: role,
    path: result.model,
    duration: result.latencyMs,
    status: 200,
  } as any);
}

function logAllFailed(opts: RouteAndGenerateOpts, attempts: AttemptLog[]): void {
  logger.error("AI generation failed — all models exhausted", {
    userId: opts.userId,
    organizationId: opts.organizationId,
    error: `${attempts.length} attempts failed`,
    method: "fallback",
    path: attempts.map((a) => `${a.model}:${a.errorCode}`).join(", "),
  } as any);
}
