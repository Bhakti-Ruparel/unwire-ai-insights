/**
 * schemaExtractor.ts
 *
 * Extracts database schema from:
 *  1. Prisma schema files (schema.prisma)
 *  2. Mongoose schemas (new mongoose.Schema({ ... }))
 *  3. SQL DDL statements (CREATE TABLE ...)
 *
 * Returns a flat list of DatabaseTableDTO entries that can be stored
 * directly in schema_tables.
 */

import fs from "fs";
import type { ScannedFile } from "./codeScanner";
import type { DatabaseTableDTO } from "../models/Project";

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * extractSchema
 *
 * Runs all three extractors and merges results.
 * De-duplicates by table/model name (first occurrence wins).
 */
export function extractSchema(files: ScannedFile[]): Omit<DatabaseTableDTO, "id">[] {
  const all: Omit<DatabaseTableDTO, "id">[] = [];

  for (const file of files) {
    const ext = file.extension.toLowerCase();
    if (file.size > 500_000) continue; // skip huge files

    let content: string;
    try {
      content = fs.readFileSync(file.absolutePath, "utf-8");
    } catch {
      continue;
    }

    if (ext === "prisma") {
      all.push(...extractPrismaSchema(content));
    }

    if (["js", "ts", "jsx", "tsx", "mjs", "cjs"].includes(ext)) {
      all.push(...extractMongooseSchema(content, file.relativePath));
    }

    if (["sql", "psql"].includes(ext) || file.relativePath.endsWith(".sql")) {
      all.push(...extractSQLSchema(content));
    }

    // Also try SQL in .ts/.js migration files
    if (["ts", "js"].includes(ext) && /migration|schema|seed/i.test(file.relativePath)) {
      all.push(...extractSQLSchema(content));
    }
  }

  // Deduplicate by table name (first wins)
  const seen = new Set<string>();
  return all.filter((t) => {
    const key = t.table.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Prisma Extractor ──────────────────────────────────────────────────────

/**
 * Parses Prisma schema DSL.
 * Handles:
 *   model User {
 *     id    String @id
 *     email String @unique
 *     posts Post[]
 *   }
 */
function extractPrismaSchema(content: string): Omit<DatabaseTableDTO, "id">[] {
  const tables: Omit<DatabaseTableDTO, "id">[] = [];

  // Match each model block
  const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;

  while ((m = modelRe.exec(content)) !== null) {
    const modelName = m[1];
    const body = m[2];

    const fields: string[] = [];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines, decorators (@@), and comments (//)
      if (!trimmed || trimmed.startsWith("@@") || trimmed.startsWith("//")) continue;

      // Field line:  fieldName  Type  optional_modifiers
      const fieldMatch = trimmed.match(/^(\w+)\s+([\w?[\]]+)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2]
          .replace("?", " (optional)")
          .replace("[]", " (relation)");

        fields.push(`${fieldName}: ${fieldType}`);
      }
    }

    if (fields.length > 0) {
      tables.push({ table: modelName, fields });
    }
  }

  return tables;
}

// ─── Mongoose Extractor ────────────────────────────────────────────────────

/**
 * Detects Mongoose schema definitions.
 * Handles:
 *   const UserSchema = new mongoose.Schema({ name: String, ... })
 *   const userSchema = new Schema({ email: { type: String, required: true } })
 */
function extractMongooseSchema(
  content: string,
  filePath: string
): Omit<DatabaseTableDTO, "id">[] {
  const tables: Omit<DatabaseTableDTO, "id">[] = [];

  // Quick bail-out if no Schema reference
  if (!content.includes("Schema") || !content.includes("mongoose")) return tables;

  // Match:  const XSchema = new mongoose.Schema({...})  or  new Schema({...})
  // We capture the variable name to infer the collection name.
  const schemaRe =
    /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{([\s\S]*?)\}\s*(?:,[\s\S]*?)?\)/g;

  let m: RegExpExecArray | null;
  while ((m = schemaRe.exec(content)) !== null) {
    const varName = m[1]; // e.g. "UserSchema"
    const body = m[2];

    // Infer collection name by stripping "Schema" suffix
    const collectionName = varName.replace(/Schema$/i, "") || varName;

    const fields = extractMongooseFields(body);
    if (fields.length > 0) {
      tables.push({ table: collectionName, fields });
    }
  }

  return tables;
}

/** Parse the object literal inside new Schema({...}) */
function extractMongooseFields(body: string): string[] {
  const fields: string[] = [];

  // Each top-level key is a field:  fieldName: Type  or  fieldName: { type: Type }
  const fieldRe = /^\s*(\w+)\s*:/gm;
  let m: RegExpExecArray | null;

  while ((m = fieldRe.exec(body)) !== null) {
    const name = m[1];
    // Skip nested config keys like "type", "required", "default", "ref"
    if (["type", "required", "default", "ref", "index", "unique", "enum", "min", "max", "trim"].includes(name)) {
      continue;
    }
    fields.push(name);
  }

  // Deduplicate
  return [...new Set(fields)];
}

// ─── SQL Extractor ─────────────────────────────────────────────────────────

/**
 * Parses SQL DDL to extract CREATE TABLE statements.
 * Supports PostgreSQL and MySQL syntax.
 *
 * CREATE TABLE users (
 *   id   SERIAL PRIMARY KEY,
 *   email VARCHAR(255) NOT NULL UNIQUE
 * );
 */
function extractSQLSchema(content: string): Omit<DatabaseTableDTO, "id">[] {
  const tables: Omit<DatabaseTableDTO, "id">[] = [];

  // Match CREATE TABLE blocks (case-insensitive)
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
  let m: RegExpExecArray | null;

  while ((m = tableRe.exec(content)) !== null) {
    const tableName = m[1];
    const body = m[2];

    const fields = extractSQLColumns(body);
    if (fields.length > 0) {
      tables.push({ table: tableName, fields });
    }
  }

  return tables;
}

function extractSQLColumns(body: string): string[] {
  const fields: string[] = [];

  for (const rawLine of body.split(",")) {
    const line = rawLine.trim().replace(/\s+/g, " ");

    // Skip constraints/indexes
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX|KEY|CONSTRAINT)/i.test(line)) continue;
    if (!line) continue;

    // Column definition: column_name TYPE modifiers
    const colMatch = line.match(/^["`]?(\w+)["`]?\s+([\w()]+)/i);
    if (colMatch) {
      const colName = colMatch[1];
      const colType = colMatch[2].toUpperCase();
      const isNullable = !/NOT NULL/i.test(line);
      const isPK = /PRIMARY KEY/i.test(line);
      const suffix = [
        isPK ? "PK" : null,
        isNullable && !isPK ? "nullable" : null,
      ]
        .filter(Boolean)
        .join(", ");

      fields.push(suffix ? `${colName}: ${colType} (${suffix})` : `${colName}: ${colType}`);
    }
  }

  return fields;
}
