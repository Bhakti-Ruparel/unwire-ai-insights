/**
 * run-pipeline-test.ts
 *
 * Phase 1 integration tests for the Unwire AI analysis pipeline.
 * Runs without a database connection — tests the analysis engine directly.
 *
 * Usage:
 *   npx ts-node test-samples/run-pipeline-test.ts
 */

import path from "path";
import { analyzeProject } from "../src/services/analyzerService";

const SAMPLE_ZIP = path.join(__dirname, "sample-react-express.zip");
const PROJECT_ID = "test-pipeline-001";

// ─── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(50 - name.length)}`);
}

// ─── Test 1: ZIP Upload Analysis Pipeline ─────────────────────────────────

async function testZipPipeline(): Promise<void> {
  section("Test 1: ZIP Upload Analysis Pipeline");
  console.log(`  Analyzing: ${SAMPLE_ZIP}`);
  console.log(`  Project ID: ${PROJECT_ID}\n`);

  const result = await analyzeProject(SAMPLE_ZIP, PROJECT_ID, "Sample React Express");

  // Framework detection
  assert(result.framework.includes("React"), `Framework includes React (got: "${result.framework}")`);
  assert(result.framework.includes("Express"), `Framework includes Express (got: "${result.framework}")`);

  // Database detection
  assert(result.stack.includes("MongoDB"), `Stack includes MongoDB (got: ${JSON.stringify(result.stack)})`);

  // File scanning
  assert(result.filesCount >= 5, `Files scanned >= 5 (got: ${result.filesCount})`);

  // API detection
  assert(result.apis.length >= 3, `APIs detected >= 3 (got: ${result.apis.length})`);

  // Dependencies
  assert(result.dependencies.length >= 5, `Dependencies detected >= 5 (got: ${result.dependencies.length})`);

  // Schema extraction
  console.log(`  Schema tables found: ${result.schema.length}`);
  if (result.schema.length > 0) {
    console.log(`    Tables: ${result.schema.map((t) => t.table).join(", ")}`);
  }

  // External services detection
  console.log(`  External services found: ${result.externalServices.length}`);
  if (result.externalServices.length > 0) {
    console.log(`    Services: ${result.externalServices.map((s) => s.name).join(", ")}`);
  }

  // Architecture graph
  assert(result.architectureNodes.length >= 2, `Architecture nodes >= 2 (got: ${result.architectureNodes.length})`);
  assert(result.architectureEdges.length >= 1, `Architecture edges >= 1 (got: ${result.architectureEdges.length})`);

  // Print detected APIs
  console.log(`\n  Detected APIs (${result.apis.length}):`);
  for (const api of result.apis.slice(0, 10)) {
    const auth = api.authenticated ? " 🔒" : "";
    const mw = api.middleware && api.middleware.length > 0 ? ` [${api.middleware.join(", ")}]` : "";
    console.log(`    ${api.method.padEnd(7)} ${api.path}${auth}${mw}  ← ${api.file}`);
  }

  // Print dependencies
  console.log(`\n  Dependencies (${result.dependencies.length}):`);
  for (const dep of result.dependencies.slice(0, 8)) {
    console.log(`    ${dep.name}@${dep.version} (${dep.type})`);
  }
}

// ─── Test 2: GitHub URL Analysis (validates sanitizer, not actual clone) ───

async function testGitHubUrlSanitizer(): Promise<void> {
  section("Test 2: GitHub URL Sanitizer");

  const { sanitizeGitHubUrl } = await import("../src/services/githubService");

  assert(
    sanitizeGitHubUrl("https://github.com/org/repo") === "https://github.com/org/repo",
    "HTTPS URL passes through unchanged"
  );
  assert(
    sanitizeGitHubUrl("https://github.com/org/repo.git") === "https://github.com/org/repo",
    ".git suffix stripped"
  );
  assert(
    sanitizeGitHubUrl("github.com/org/repo") === "https://github.com/org/repo",
    "Adds https:// prefix"
  );
  assert(
    sanitizeGitHubUrl("git@github.com:org/repo.git") === "https://github.com/org/repo",
    "SSH format converted to HTTPS"
  );
  assert(
    sanitizeGitHubUrl("https://github.com/org/repo/") === "https://github.com/org/repo",
    "Trailing slash stripped"
  );
}

// ─── Test 3: Schema Extractor ──────────────────────────────────────────────

async function testSchemaExtractor(): Promise<void> {
  section("Test 3: Schema Extractor (unit test)");

  const { extractSchema } = await import("../src/services/schemaExtractor");
  const path = await import("path");
  const fs = await import("fs");
  const os = await import("os");

  // Create temp files for testing
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unwire-test-"));

  // Test Prisma schema
  const prismaContent = `
model User {
  id    String @id @default(uuid())
  email String @unique
  name  String
  posts Post[]
}

model Post {
  id      String @id
  title   String
  content String?
  userId  String
  user    User   @relation(fields: [userId], references: [id])
}
  `;
  const prismaPath = path.join(tmpDir, "schema.prisma");
  fs.writeFileSync(prismaPath, prismaContent);

  // Test SQL schema
  const sqlContent = `
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100)
);
  `;
  const sqlPath = path.join(tmpDir, "migration.sql");
  fs.writeFileSync(sqlPath, sqlContent);

  const files = [
    { relativePath: "schema.prisma", absolutePath: prismaPath, extension: "prisma", size: 200 },
    { relativePath: "migration.sql", absolutePath: sqlPath, extension: "sql", size: 200 },
  ];

  const schema = extractSchema(files);

  assert(schema.length >= 2, `Schema tables >= 2 (got: ${schema.length})`);
  const userTable = schema.find((t) => t.table === "User");
  assert(!!userTable, "User model detected from Prisma schema");
  if (userTable) {
    assert(userTable.fields.length >= 3, `User model has >= 3 fields (got: ${userTable.fields.length})`);
  }
  const postTable = schema.find((t) => t.table === "Post");
  assert(!!postTable, "Post model detected from Prisma schema");

  const productsTable = schema.find((t) => t.table === "products");
  assert(!!productsTable, "products table detected from SQL CREATE TABLE");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });

  if (schema.length > 0) {
    console.log(`\n  Schema tables detected:`);
    for (const t of schema) {
      console.log(`    ${t.table}: ${t.fields.slice(0, 3).join(", ")}${t.fields.length > 3 ? "…" : ""}`);
    }
  }
}

// ─── Test 4: External Service Detector ────────────────────────────────────

async function testExternalServiceDetector(): Promise<void> {
  section("Test 4: External Service Detector");

  const { detectExternalServices } = await import("../src/services/externalServiceDetector");

  const mockDeps = [
    { name: "stripe", version: "14.0.0", type: "runtime" as const },
    { name: "openai", version: "4.0.0", type: "runtime" as const },
    { name: "nodemailer", version: "6.0.0", type: "runtime" as const },
    { name: "react", version: "18.0.0", type: "runtime" as const },
  ];

  const services = detectExternalServices(mockDeps, []);

  assert(services.length >= 3, `Services detected >= 3 (got: ${services.length})`);
  assert(services.some((s) => s.name === "Stripe"), "Stripe detected");
  assert(services.some((s) => s.name === "OpenAI"), "OpenAI detected");
  assert(services.some((s) => s.name === "Nodemailer"), "Nodemailer detected");
  assert(!services.some((s) => s.name === "React"), "React NOT counted as external service");

  console.log(`\n  Services detected: ${services.map((s) => `${s.name} (${s.type})`).join(", ")}`);
}

// ─── Runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  Unwire AI — Phase 1 Pipeline Tests");
  console.log("═".repeat(60));

  try {
    await testZipPipeline();
    await testGitHubUrlSanitizer();
    await testSchemaExtractor();
    await testExternalServiceDetector();
  } catch (err) {
    console.error("\n[FATAL ERROR]", err);
    process.exit(1);
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
