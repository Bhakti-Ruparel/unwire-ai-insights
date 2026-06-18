/**
 * githubService.ts
 *
 * Clones a GitHub repository into uploads/<projectId>/source/
 * using simple-git. After cloning, the same analyzeProject pipeline
 * runs unchanged — it only sees a source directory, not a ZIP.
 */

import path from "path";
import fs from "fs";
import simpleGit from "simple-git";
import { UPLOADS_ROOT } from "./fileService";

/**
 * cloneRepository
 *
 * @param githubUrl   HTTPS or SSH GitHub URL, e.g. https://github.com/org/repo
 * @param projectId   UUID used to build the target directory path
 * @returns           Absolute path to the cloned source directory
 */
export async function cloneRepository(
  githubUrl: string,
  projectId: string
): Promise<string> {
  const targetDir = path.join(UPLOADS_ROOT, projectId, "source");

  // Clean any previous clone
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[githubService] Cloning ${githubUrl} → ${targetDir}`);

  const git = simpleGit();

  try {
    await git.clone(githubUrl, targetDir, [
      "--depth=1",   // shallow clone — we only need the latest snapshot
      "--single-branch",
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone repository: ${msg}`);
  }

  console.log(`[githubService] Clone complete: ${targetDir}`);
  return targetDir;
}

/**
 * sanitizeGitHubUrl
 *
 * Normalises user-provided GitHub URLs:
 *   - https://github.com/org/repo  → same (already correct)
 *   - https://github.com/org/repo/ → strip trailing slash
 *   - github.com/org/repo          → add https://
 *   - git@github.com:org/repo.git  → convert SSH to HTTPS
 */
export function sanitizeGitHubUrl(url: string): string {
  let cleaned = url.trim();

  // SSH format: git@github.com:org/repo.git
  if (cleaned.startsWith("git@")) {
    cleaned = cleaned
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "");
    return cleaned;
  }

  // Ensure https prefix
  if (!cleaned.startsWith("http")) {
    cleaned = "https://" + cleaned;
  }

  // Strip trailing slash and .git suffix
  cleaned = cleaned.replace(/\/$/, "").replace(/\.git$/, "");

  return cleaned;
}
