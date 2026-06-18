/**
 * embeddings.ts
 *
 * Thin wrapper around OpenAIEmbeddings from @langchain/openai.
 * Centralises embedding model config so it can be swapped out
 * (e.g. for a local model) without touching the rest of the AI stack.
 */

import { OpenAIEmbeddings } from "@langchain/openai";

// Singleton — reuse across the process lifetime
let _embeddings: OpenAIEmbeddings | null = null;

/**
 * getEmbeddings
 *
 * Returns the shared OpenAIEmbeddings instance. Lazily initialised on
 * first call so server startup doesn't fail if OPENAI_API_KEY is not set.
 *
 * @throws Error if OPENAI_API_KEY is missing
 */
export function getEmbeddings(): OpenAIEmbeddings {
  if (_embeddings) return _embeddings;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to backend/.env to enable AI features."
    );
  }

  _embeddings = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    modelName:    "text-embedding-3-small",   // cheapest + good quality
    batchSize:    512,                         // max per API call
    stripNewLines: true,
  });

  return _embeddings;
}

/**
 * isEmbeddingAvailable
 *
 * Safe check — returns false if OPENAI_API_KEY is not configured.
 * Lets the server degrade gracefully rather than crash.
 */
export function isEmbeddingAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
