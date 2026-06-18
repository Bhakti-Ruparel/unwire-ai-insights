/**
 * vectorStore.ts
 *
 * ChromaDB vector store with strict per-project isolation.
 *
 * Collection naming: project_<uuid>_vectors
 *   → Each project has its own isolated Chroma collection.
 *   → Project A can NEVER access Project B's vectors.
 *
 * Chroma is expected to be running at CHROMA_URL (default: http://localhost:8000).
 */

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { getEmbeddings } from "./embeddings";

// ─── Config ────────────────────────────────────────────────────────────────

const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";

/** Returns the isolated Chroma collection name for a project. */
export function collectionName(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9]/g, "_");
  return `project_${safe}_vectors`;
}

// ─── Write ─────────────────────────────────────────────────────────────────

/**
 * upsertProjectVectors
 *
 * Creates (or replaces) the Chroma collection for `projectId` and
 * inserts all provided LangChain Documents.
 */
export async function upsertProjectVectors(
  projectId: string,
  documents: Document[]
): Promise<void> {
  if (documents.length === 0) {
    console.warn(`[vectorStore] No documents to upsert for project ${projectId}`);
    return;
  }

  const name = collectionName(projectId);
  console.log(
    `[vectorStore] Upserting ${documents.length} docs → collection "${name}" @ ${CHROMA_URL}`
  );

  await Chroma.fromDocuments(documents, getEmbeddings(), {
    collectionName: name,
    url: CHROMA_URL,
    collectionMetadata: { "hnsw:space": "cosine" },
  });

  console.log(`[vectorStore] Upsert complete for project ${projectId}`);
}

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * searchProjectVectors
 *
 * Similarity search strictly within the project's own Chroma collection.
 */
export async function searchProjectVectors(
  projectId: string,
  query: string,
  k = 6
): Promise<Document[]> {
  const name = collectionName(projectId);

  // Cast to VectorStore base type so TypeScript sees similaritySearch
  const store = (await Chroma.fromExistingCollection(getEmbeddings(), {
    collectionName: name,
    url: CHROMA_URL,
  })) as unknown as VectorStore;

  const results = await store.similaritySearch(query, k);
  console.log(`[vectorStore] ${results.length} results for "${query.slice(0, 50)}"`);
  return results;
}

/**
 * deleteProjectVectors
 *
 * Removes all vectors for a project. Called on re-upload or deletion.
 */
export async function deleteProjectVectors(projectId: string): Promise<void> {
  try {
    const name = collectionName(projectId);
    const store = await Chroma.fromExistingCollection(getEmbeddings(), {
      collectionName: name,
      url: CHROMA_URL,
    });
    await store.delete({ filter: {} });
    console.log(`[vectorStore] Deleted collection "${name}"`);
  } catch {
    // Collection may not exist — silently ignore
  }
}

/**
 * projectVectorsExist
 *
 * Returns true if the project has already been embedded.
 */
export async function projectVectorsExist(projectId: string): Promise<boolean> {
  try {
    const store = (await Chroma.fromExistingCollection(getEmbeddings(), {
      collectionName: collectionName(projectId),
      url: CHROMA_URL,
    })) as unknown as VectorStore;
    const results = await store.similaritySearch("test", 1);
    return results.length > 0;
  } catch {
    return false;
  }
}
