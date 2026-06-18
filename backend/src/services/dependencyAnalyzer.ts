/**
 * dependencyAnalyzer.ts
 *
 * Reads package.json / requirements.txt / pom.xml / go.mod / Cargo.toml
 * and returns a unified list of dependencies regardless of ecosystem.
 */

import fs from "fs";
import path from "path";
import type { ScannedFile } from "./codeScanner";
import type { DependencyDTO } from "../models/Project";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DependencyAnalysisResult {
  dependencies: DependencyDTO[];
  /** Detected package manager / ecosystem */
  ecosystem: string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * analyzeDependencies
 *
 * Scans known manifest files found in `files` and returns a unified
 * dependency list. Tries each parser in order; stops after the first
 * that yields results (so a JS+Python project reports both).
 */
export function analyzeDependencies(
  rootDir: string,
  files: ScannedFile[]
): DependencyAnalysisResult {
  const all: DependencyDTO[] = [];
  let ecosystem = "unknown";

  // ── Node.js (package.json) ─────────────────────────────────────────────
  const pkgJsonFile = files.find((f) => f.relativePath === "package.json");
  if (pkgJsonFile) {
    const result = parsePackageJson(pkgJsonFile.absolutePath);
    all.push(...result);
    if (result.length > 0) ecosystem = "Node.js";
  }

  // ── Python (requirements.txt) ──────────────────────────────────────────
  const reqFile = files.find(
    (f) =>
      f.relativePath === "requirements.txt" ||
      f.relativePath.endsWith("/requirements.txt")
  );
  if (reqFile) {
    const result = parseRequirementsTxt(reqFile.absolutePath);
    all.push(...result);
    if (result.length > 0) ecosystem = ecosystem === "unknown" ? "Python" : `${ecosystem} + Python`;
  }

  // ── Java/Kotlin (pom.xml) ──────────────────────────────────────────────
  const pomFile = files.find((f) => f.relativePath === "pom.xml");
  if (pomFile) {
    const result = parsePomXml(pomFile.absolutePath);
    all.push(...result);
    if (result.length > 0) ecosystem = ecosystem === "unknown" ? "Java" : `${ecosystem} + Java`;
  }

  // ── Go (go.mod) ────────────────────────────────────────────────────────
  const goMod = files.find((f) => f.relativePath === "go.mod");
  if (goMod) {
    const result = parseGoMod(goMod.absolutePath);
    all.push(...result);
    if (result.length > 0) ecosystem = ecosystem === "unknown" ? "Go" : `${ecosystem} + Go`;
  }

  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  const unique = all.filter((d) => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });

  return { dependencies: unique, ecosystem };
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parsePackageJson(filePath: string): DependencyDTO[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const result: DependencyDTO[] = [];

    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      result.push({ name, version: cleanVersion(version), type: "runtime" });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      result.push({ name, version: cleanVersion(version), type: "dev" });
    }
    for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
      result.push({ name, version: cleanVersion(version), type: "peer" });
    }

    return result;
  } catch {
    return [];
  }
}

function parseRequirementsTxt(filePath: string): DependencyDTO[] {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    const result: DependencyDTO[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("-")) continue;

      // Formats: package==1.0.0  /  package>=1.0  /  package  /  package[extra]
      const match = line.match(/^([A-Za-z0-9_.\-\[\]]+?)(?:[><=!~^]+(.+))?$/);
      if (match) {
        result.push({
          name: match[1].replace(/\[.*\]/, "").trim(),
          version: (match[2] ?? "latest").trim(),
          type: "runtime",
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}

function parsePomXml(filePath: string): DependencyDTO[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const result: DependencyDTO[] = [];

    // Simple regex extraction — enough for detection without a full XML parser
    const depBlocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? [];
    for (const block of depBlocks) {
      const artifactId = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
      const version = block.match(/<version>([^<]+)<\/version>/)?.[1];
      const scope = block.match(/<scope>([^<]+)<\/scope>/)?.[1];

      if (artifactId) {
        result.push({
          name: artifactId,
          version: version ?? "unknown",
          type: scope === "test" ? "dev" : "runtime",
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}

function parseGoMod(filePath: string): DependencyDTO[] {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    const result: DependencyDTO[] = [];
    let inRequire = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith("require (")) { inRequire = true; continue; }
      if (inRequire && line === ")") { inRequire = false; continue; }

      if (inRequire || line.startsWith("require ")) {
        const parts = line.replace(/^require\s+/, "").trim().split(/\s+/);
        if (parts.length >= 2 && parts[0] && !parts[0].startsWith("//")) {
          result.push({ name: parts[0], version: parts[1], type: "runtime" });
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip semver range prefixes (^, ~, >=, etc.) */
function cleanVersion(v: string): string {
  return v.replace(/^[\^~>=<]+/, "").trim() || v.trim();
}
