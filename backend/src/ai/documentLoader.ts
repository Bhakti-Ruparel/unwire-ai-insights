/**
 * documentLoader.ts
 *
 * Reads extracted project source files from uploads/<projectId>/source/
 * and returns them as LangChain Document objects ready for chunking.
 *
 * Supported extensions: .js .ts .jsx .tsx .py .java .go .json .prisma .sql .md
 * Ignored dirs: node_modules .git dist build coverage __pycache__ venv .next
 */

import fs from "fs";
import path from "path";
import { Document } from "@langchain/core/documents";
import { UPLOADS_ROOT } from "../services/fileService";

// ─── Config ────────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".py", ".java", ".kt", ".go", ".rb", ".php", ".cs",
  ".json", ".yaml", ".yml", ".toml",
  ".prisma", ".graphql",
  ".sql", ".md", ".txt",
  ".html", ".css", ".scss",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "__pycache__", ".pytest_cache", "venv", ".venv", "env",
  "coverage", ".nyc_output", ".cache", "vendor", "target",
  ".gradle", ".idea", ".vscode",
]);

const MAX_FILE_SIZE_BYTES = 200_000; // 200 KB — skip giant generated files

// ─── Public API ────────────────────────────────────────────────────────────

export interface ProjectDocument {
  content: string;
  metadata: {
    projectId: string;
    file: string;        // relative path from project root
    path: string;        // absolute path
    extension: string;
    size: number;
  };
}

/**
 * loadProjectFiles
 *
 * Walks uploads/<projectId>/source/ and returns all readable source files
 * as ProjectDocument objects. Called by the embedding pipeline.
 *
 * @param projectId  UUID of the project
 * @returns          Array of ProjectDocument (content + metadata)
 */
export function loadProjectFiles(projectId: string): ProjectDocument[] {
  // Try the standard source dir; if missing, fall back to the upload root
  const standardDir = path.join(UPLOADS_ROOT, projectId, "source");
  const sourceDir = fs.existsSync(standardDir)
    ? findActualRoot(standardDir)
    : path.join(UPLOADS_ROOT, projectId);

  if (!fs.existsSync(sourceDir)) {
    console.warn(`[documentLoader] Source dir not found: ${sourceDir}`);
    return [];
  }

  const docs: ProjectDocument[] = [];
  walkDir(sourceDir, sourceDir, projectId, docs);
  console.log(`[documentLoader] Loaded ${docs.length} files for project ${projectId}`);
  return docs;
}

/**
 * toLangChainDocuments
 *
 * Converts ProjectDocument array to LangChain Document array for use
 * with text splitters and vector stores.
 */
export function toLangChainDocuments(projectDocs: ProjectDocument[]): Document[] {
  return projectDocs.map(
    (d) =>
      new Document({
        pageContent: d.content,
        metadata: d.metadata,
      })
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** If the extracted dir has exactly one child directory, descend into it (GitHub ZIPs). */
function findActualRoot(dir: string): string {
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 1) {
      const candidate = path.join(dir, entries[0]);
      if (fs.statSync(candidate).isDirectory()) return candidate;
    }
  } catch {
    // ignore
  }
  return dir;
}

function walkDir(
  root: string,
  current: string,
  projectId: string,
  out: ProjectDocument[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;

    const abs = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkDir(root, abs, projectId, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      let size = 0;
      try { size = fs.statSync(abs).size; } catch { continue; }
      if (size === 0 || size > MAX_FILE_SIZE_BYTES) continue;

      let content = "";
      try { content = fs.readFileSync(abs, "utf-8"); } catch { continue; }
      if (!content.trim()) continue;

      const relativePath = path.relative(root, abs).replace(/\\/g, "/");

      out.push({
        content,
        metadata: {
          projectId,
          file: relativePath,
          path: abs,
          extension: ext,
          size,
        },
      });
    }
  }
}
