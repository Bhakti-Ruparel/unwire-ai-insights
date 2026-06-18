/**
 * chunker.ts
 *
 * Splits project source files into overlapping chunks suitable for
 * embedding. Preserves filename and line-number metadata so the AI can
 * cite exact file + line ranges in answers.
 *
 * Strategy:
 *  - Code files   → split by lines, 80-line chunks, 20-line overlap
 *  - JSON / YAML  → split by characters, 1500 chars, 200 overlap
 *  - Markdown/txt → split by paragraphs / characters, 1200 chars
 */

import { Document } from "@langchain/core/documents";
import type { ProjectDocument } from "./documentLoader";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CodeChunk {
  content: string;
  metadata: {
    projectId: string;
    file: string;
    startLine: number;
    endLine: number;
    extension: string;
  };
}

// ─── Config ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".py", ".java", ".kt", ".go", ".rb", ".php", ".cs",
  ".prisma", ".graphql", ".sql", ".html", ".css", ".scss",
]);

const LINES_PER_CHUNK = 80;
const LINE_OVERLAP    = 20;

const CHAR_CHUNK_SIZE    = 1_500;
const CHAR_CHUNK_OVERLAP = 200;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * chunkProjectDocuments
 *
 * Takes raw ProjectDocuments and returns CodeChunk[] with all metadata
 * attached. For use by the embedding pipeline.
 */
export function chunkProjectDocuments(docs: ProjectDocument[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  for (const doc of docs) {
    const ext = doc.metadata.extension;
    if (CODE_EXTENSIONS.has(ext)) {
      chunks.push(...chunkByLines(doc));
    } else {
      chunks.push(...chunkByCharacters(doc));
    }
  }
  console.log(`[chunker] Produced ${chunks.length} chunks from ${docs.length} files`);
  return chunks;
}

/**
 * chunksToLangChainDocuments
 *
 * Converts CodeChunk[] to LangChain Document[] for insertion into a
 * vector store. Metadata is preserved exactly.
 */
export function chunksToLangChainDocuments(chunks: CodeChunk[]): Document[] {
  return chunks.map(
    (c) =>
      new Document({
        pageContent: c.content,
        metadata: {
          projectId:  c.metadata.projectId,
          file:       c.metadata.file,
          startLine:  c.metadata.startLine,
          endLine:    c.metadata.endLine,
          extension:  c.metadata.extension,
        },
      })
  );
}

// ─── Splitters ─────────────────────────────────────────────────────────────

/** Line-based splitter — preserves line numbers for source citation */
function chunkByLines(doc: ProjectDocument): CodeChunk[] {
  const lines = doc.content.split("\n");
  const chunks: CodeChunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const end   = Math.min(start + LINES_PER_CHUNK, lines.length);
    const slice = lines.slice(start, end).join("\n").trim();

    if (slice.length > 0) {
      chunks.push({
        content: slice,
        metadata: {
          projectId: doc.metadata.projectId,
          file:      doc.metadata.file,
          startLine: start + 1,          // 1-indexed for display
          endLine:   end,
          extension: doc.metadata.extension,
        },
      });
    }

    // Move forward, backing up by overlap
    start += LINES_PER_CHUNK - LINE_OVERLAP;
    if (start >= lines.length) break;
  }

  return chunks;
}

/** Character-based splitter — for config / data / prose files */
function chunkByCharacters(doc: ProjectDocument): CodeChunk[] {
  const textChunks = splitSync(doc.content, CHAR_CHUNK_SIZE, CHAR_CHUNK_OVERLAP);
  return textChunks.map((text, i) => ({
    content: text,
    metadata: {
      projectId: doc.metadata.projectId,
      file:      doc.metadata.file,
      startLine: i * Math.floor(CHAR_CHUNK_SIZE / 80) + 1,
      endLine:   (i + 1) * Math.floor(CHAR_CHUNK_SIZE / 80),
      extension: doc.metadata.extension,
    },
  }));
}

/** Simple synchronous character splitter (avoids async for perf) */
function splitSync(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start += size - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}
