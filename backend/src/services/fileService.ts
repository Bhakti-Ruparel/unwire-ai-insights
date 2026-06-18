/**
 * fileService.ts
 *
 * Handles ZIP extraction and upload directory management.
 * Keeps all file-system operations in one place so the rest
 * of the pipeline only deals with abstract file paths.
 */

import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

/** Root directory where all project uploads live */
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

/**
 * Return the directory that holds everything for a project:
 *   uploads/<projectId>/
 */
export function projectUploadDir(projectId: string): string {
  return path.join(UPLOADS_ROOT, projectId);
}

/**
 * Return the directory where extracted source code lives:
 *   uploads/<projectId>/source/
 */
export function projectSourceDir(projectId: string): string {
  return path.join(UPLOADS_ROOT, projectId, "source");
}

/**
 * extractProject
 *
 * Extracts a ZIP file into uploads/<projectId>/source/.
 * Any previous extraction is wiped first so re-uploads stay clean.
 *
 * @param zipPath   Absolute path to the uploaded .zip file
 * @param projectId UUID of the project
 * @returns         Absolute path to the extracted source directory
 */
export async function extractProject(
  zipPath: string,
  projectId: string
): Promise<string> {
  const sourceDir = projectSourceDir(projectId);

  // Clean previous extraction
  if (fs.existsSync(sourceDir)) {
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sourceDir, { recursive: true });

  console.log(`[fileService] Extracting ${zipPath} → ${sourceDir}`);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(sourceDir, /* overwrite */ true);

  // Many ZIPs contain a single top-level folder (e.g. my-project-main/).
  // Detect that and return the inner folder as the real root so scanners
  // always work from the actual source root.
  const entries = fs.readdirSync(sourceDir);
  if (entries.length === 1) {
    const single = path.join(sourceDir, entries[0]);
    if (fs.statSync(single).isDirectory()) {
      console.log(`[fileService] Single root folder detected: ${entries[0]}`);
      return single;
    }
  }

  return sourceDir;
}

/**
 * ensureUploadsDir — called once at startup to guarantee the uploads/ folder exists.
 */
export function ensureUploadsDir(): void {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}
