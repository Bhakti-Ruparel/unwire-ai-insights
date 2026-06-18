/**
 * ragService.ts
 *
 * Two public functions:
 *
 *  1. embedProjectCode(projectId)
 *     Background job — loads files, chunks them, creates embeddings,
 *     stores vectors in ChromaDB. Called after analysis completes.
 *
 *  2. askProject(projectId, question)
 *     RAG query — embeds question, retrieves relevant code chunks,
 *     sends context + question to GPT, returns answer + sources.
 */

import { prisma } from "../database/db";
import { loadProjectFiles } from "./documentLoader";
import { chunkProjectDocuments, chunksToLangChainDocuments } from "./chunker";
import { upsertProjectVectors, searchProjectVectors } from "./vectorStore";
import { isEmbeddingAvailable } from "./embeddings";
import { buildStructuredContext, callLLM } from "./chatService";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RagAnswer {
  answer: string;
  sources: Array<{ file: string; lines: string }>;
  usedRag: boolean;    // false = fell back to structured context
}

// ─── Embedding job ─────────────────────────────────────────────────────────

/**
 * embedProjectCode
 *
 * Runs in the background after analysis completes.
 * Does NOT block the HTTP response.
 */
export async function embedProjectCode(projectId: string): Promise<void> {
  if (!isEmbeddingAvailable()) {
    console.log(`[ragService] OPENAI_API_KEY not set — skipping embedding for ${projectId}`);
    return;
  }

  console.log(`[ragService] Starting embedding job for project ${projectId}`);

  try {
    // 1. Load source files from disk
    const docs = loadProjectFiles(projectId);
    if (docs.length === 0) {
      console.warn(`[ragService] No files to embed for project ${projectId}`);
      return;
    }

    // 2. Chunk into 80-line segments with metadata
    const chunks = chunkProjectDocuments(docs);
    if (chunks.length === 0) {
      console.warn(`[ragService] No chunks produced for project ${projectId}`);
      return;
    }

    // 3. Convert to LangChain Documents
    const langchainDocs = chunksToLangChainDocuments(chunks);

    // 4. Upsert into project-isolated Chroma collection
    await upsertProjectVectors(projectId, langchainDocs);

    // 5. Record embedding status in PostgreSQL
    await prisma.$executeRaw`UPDATE projects SET "embeddingStatus" = 'complete' WHERE id = ${projectId}`;

    console.log(
      `[ragService] Embedding complete for ${projectId}: ${chunks.length} chunks`
    );
  } catch (err) {
    console.error(`[ragService] Embedding failed for project ${projectId}:`, err);
    // Don't rethrow — this is a background job and must not crash the process
  }
}

// ─── RAG query ─────────────────────────────────────────────────────────────

/**
 * askProject
 *
 * Main RAG function. Retrieves relevant code chunks from Chroma and
 * sends them as context to GPT to produce a grounded answer.
 *
 * Falls back to structured context (API list, schema, etc.) if:
 *  - OPENAI_API_KEY is not set
 *  - Chroma is unreachable
 *  - No vectors exist for this project yet
 */
export async function askProject(
  projectId: string,
  question: string
): Promise<RagAnswer> {

  // ── Path 1: Full RAG (requires OpenAI + Chroma) ─────────────────────────
  if (isEmbeddingAvailable()) {
    try {
      const results = await searchProjectVectors(projectId, question, 6);

      if (results.length > 0) {
        // Build context string from retrieved chunks
        const contextBlocks = results.map((doc) => {
          const meta = doc.metadata as {
            file: string;
            startLine: number;
            endLine: number;
          };
          return `--- File: ${meta.file} (lines ${meta.startLine}–${meta.endLine}) ---\n${doc.pageContent}`;
        });

        const contextText = contextBlocks.join("\n\n");
        const answer = await callLLM(projectId, question, contextText);

        // Deduplicate sources
        const seen = new Set<string>();
        const sources: RagAnswer["sources"] = [];
        for (const doc of results) {
          const meta = doc.metadata as { file: string; startLine: number; endLine: number };
          const key = `${meta.file}:${meta.startLine}`;
          if (!seen.has(key)) {
            seen.add(key);
            sources.push({ file: meta.file, lines: `${meta.startLine}–${meta.endLine}` });
          }
        }

        return { answer, sources, usedRag: true };
      }
    } catch (err) {
      console.warn(`[ragService] RAG search failed, falling back:`, err);
      // Fall through to structured context fallback
    }
  }

  // ── Path 2: Structured context fallback ─────────────────────────────────
  const answer = await buildStructuredContext(projectId, question);
  return { answer, sources: [], usedRag: false };
}
