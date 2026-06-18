/**
 * codeScanner.ts
 *
 * Recursively walks a project directory, ignores noise folders,
 * and returns a flat list of source files with metadata.
 */

import fs from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScannedFile {
  /** Path relative to the scanned root directory */
  relativePath: string;
  /** Absolute path */
  absolutePath: string;
  /** File extension without dot, e.g. "ts", "py" */
  extension: string;
  /** Size in bytes */
  size: number;
}

export interface ScanResult {
  filesCount: number;
  files: ScannedFile[];
}

// ─── Config ────────────────────────────────────────────────────────────────

/** Directories to skip entirely during traversal */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  "env",
  ".env",
  "coverage",
  ".nyc_output",
  ".cache",
  "vendor",       // PHP / Go
  "target",       // Java / Rust
  ".gradle",
  ".idea",
  ".vscode",
]);

/** File extensions considered source code (others are still counted but less useful) */
export const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "java", "kt", "go", "rs", "rb",
  "php", "cs", "cpp", "c", "h", "swift",
  "vue", "svelte", "astro",
  "json", "yaml", "yml", "toml", "xml",
  "sql", "prisma", "graphql",
  "html", "css", "scss", "sass", "less",
  "md", "mdx", "txt",
  "sh", "bash", "zsh",
  "Dockerfile", "makefile",
]);

// ─── Scanner ───────────────────────────────────────────────────────────────

/**
 * scanProject
 *
 * Recursively walks `directory`, ignores noise folders, and returns
 * all found files with their relative path, extension, and size.
 *
 * @param directory  Absolute path to the project root
 */
export function scanProject(directory: string): ScanResult {
  const files: ScannedFile[] = [];
  walk(directory, directory, files);
  return { filesCount: files.length, files };
}

function walk(root: string, current: string, out: ScannedFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    // Permission errors or broken symlinks — skip silently
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;

    const abs = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(root, abs, out);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        // Can't stat — still include the file with size 0
      }

      const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase() || entry.name.toLowerCase();

      out.push({
        relativePath: path.relative(root, abs).replace(/\\/g, "/"),
        absolutePath: abs,
        extension: ext,
        size,
      });
    }
  }
}
