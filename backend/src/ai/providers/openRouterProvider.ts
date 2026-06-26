/**
 * openRouterProvider.ts
 *
 * OpenRouter AI provider with proper error handling.
 * Classifies errors as retryable (429, 5xx, timeout) vs fatal (401, 400).
 * Throws typed errors so the router can decide whether to fallback.
 */

import axios, { type AxiosError } from "axios";
import {
  registerAIProvider,
  type AIProvider,
  type GenerateOptions,
  type GenerateResult,
} from "./AIProvider";
import { logger } from "../../services/logger";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class AIRetryableError extends Error {
  constructor(public statusCode: number, message: string, public model: string) {
    super(message);
    this.name = "AIRetryableError";
  }
}

export class AIFatalError extends Error {
  constructor(public statusCode: number, message: string, public model: string) {
    super(message);
    this.name = "AIFatalError";
  }
}

const openRouterProvider: AIProvider = {
  name: "openrouter",

  isAvailable(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  },

  async generateResponse(opts: GenerateOptions): Promise<GenerateResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new AIFatalError(401, "OPENROUTER_API_KEY not configured.", opts.model);

    const start = Date.now();

    try {
      const response = await axios.post(OPENROUTER_URL, {
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
      }, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.FRONTEND_URL?.split(",")[0] ?? "https://unwire.ai",
          "X-Title": "Unwire AI",
        },
        timeout: 60_000,
      });

      const data = response.data;
      const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
      const tokensUsed = data?.usage?.total_tokens;

      // Empty response = model overloaded (treat as retryable)
      if (!content) {
        throw new AIRetryableError(503, "Model returned empty response.", opts.model);
      }

      return {
        content,
        model: opts.model,
        provider: "openrouter",
        latencyMs: Date.now() - start,
        tokensUsed,
      };
    } catch (err: any) {
      const latency = Date.now() - start;

      // Already a typed error from us
      if (err instanceof AIRetryableError || err instanceof AIFatalError) throw err;

      // Axios error with response
      if (err.response) {
        const status: number = err.response.status;
        const msg = err.response.data?.error?.message ?? err.message ?? "Unknown error";

        logger.warn(`OpenRouter error`, {
          path: opts.model, status, duration: latency,
          error: msg,
        } as any);

        // Retryable: rate limit, server errors, overloaded
        if (status === 429 || status >= 500) {
          throw new AIRetryableError(status, msg, opts.model);
        }
        // Fatal: auth, bad request, model not found
        throw new AIFatalError(status, msg, opts.model);
      }

      // Timeout or network error — retryable
      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT" || err.message?.includes("timeout")) {
        throw new AIRetryableError(408, `Timeout after ${latency}ms`, opts.model);
      }

      // Unknown error — treat as retryable
      throw new AIRetryableError(500, err.message ?? "Unknown error", opts.model);
    }
  },
};

registerAIProvider(openRouterProvider);
export default openRouterProvider;
