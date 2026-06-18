/**
 * run-deployment-test.ts
 *
 * Tests the deployment analysis pipeline against the sample project.
 * Run: npx ts-node test-samples/run-deployment-test.ts
 */

import path from "path";
import os from "os";
import fs from "fs";
import { analyzeDeployment } from "../src/deployment/deploymentAnalyzer";
import { detectDeploymentFiles } from "../src/deployment/deploymentDetector";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { console.log(`  ✓ ${msg}`); passed++; }
  else           { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}

function section(name: string) {
  console.log(`\n── ${name} ${"─".repeat(50 - name.length)}`);
}

// ─── Test 1: Project WITHOUT deployment files ──────────────────────────────

async function testMissingDeployment() {
  section("Test 1: Project with no deployment files");

  // Use the sample react-express directory
  const sampleDir = path.join(__dirname, "sample-react-express");
  const result = analyzeDeployment(sampleDir, ["React", "Express", "MongoDB"]);

  assert(!result.detection.hasDocker,        "Docker not detected (correct — sample has no Dockerfile)");
  assert(!result.detection.hasGithubActions, "GitHub Actions not detected");
  assert(result.detection.missingCritical.length > 0, "Missing critical files reported");
  assert(result.recommendations.length > 0,  "Recommendations generated for missing files");
  assert(result.score < 50,                  `Score < 50 for project with no deployment files (got ${result.score})`);

  console.log(`\n  Score: ${result.score}/100`);
  console.log(`  Missing: ${result.detection.missingCritical.join(", ")}`);
  console.log(`  Recommendations: ${result.recommendations.map(r => r.title).join(", ")}`);
}

// ─── Test 2: Project WITH Dockerfile ──────────────────────────────────────

async function testWithDocker() {
  section("Test 2: Project with Dockerfile");

  // Create a temp dir with a sample Dockerfile
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unwire-deploy-test-"));

  // Write a Dockerfile with known issues
  fs.writeFileSync(path.join(tmpDir, "Dockerfile"), `FROM node:latest
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "index.js"]
`);

  const result = analyzeDeployment(tmpDir, ["Express"]);

  assert(result.detection.hasDocker, "Dockerfile detected");
  assert(result.issues.length > 0,   "Issues found in Dockerfile");

  const latestTagIssue = result.issues.find(i => i.message.toLowerCase().includes("latest"));
  assert(!!latestTagIssue, ":latest tag issue detected");

  const npmInstallIssue = result.issues.find(i => i.message.toLowerCase().includes("npm install"));
  assert(!!npmInstallIssue, "npm install vs npm ci issue detected");

  const rootUserIssue = result.issues.find(i => i.message.toLowerCase().includes("root"));
  assert(!!rootUserIssue, "Running as root issue detected");

  console.log(`\n  Score: ${result.score}/100`);
  console.log(`  Issues (${result.issues.length}):`);
  result.issues.forEach(i => console.log(`    [${i.severity}] ${i.message}`));

  fs.rmSync(tmpDir, { recursive: true });
}

// ─── Test 3: Project with full deployment stack ────────────────────────────

async function testFullDeployment() {
  section("Test 3: Project with full deployment stack");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unwire-full-deploy-"));

  // Good Dockerfile
  fs.writeFileSync(path.join(tmpDir, "Dockerfile"), `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
`);

  // docker-compose
  fs.writeFileSync(path.join(tmpDir, "docker-compose.yml"), `version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://postgres:pass@db:5432/app
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
`);

  // .env.example
  fs.writeFileSync(path.join(tmpDir, ".env.example"), `PORT=3000\nDATABASE_URL=\nJWT_SECRET=`);

  // GitHub Actions
  const ghDir = path.join(tmpDir, ".github", "workflows");
  fs.mkdirSync(ghDir, { recursive: true });
  fs.writeFileSync(path.join(ghDir, "ci.yml"), `name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: npm run build
`);

  const result = analyzeDeployment(tmpDir, ["Express", "PostgreSQL"]);

  assert(result.detection.hasDocker,          "Dockerfile detected");
  assert(result.detection.hasDockerCompose,   "docker-compose.yml detected");
  assert(result.detection.hasGithubActions,   "GitHub Actions detected");
  assert(result.detection.hasEnvExample,      ".env.example detected");
  assert(result.score > 60,                   `Score > 60 for well-configured project (got ${result.score})`);

  // Architecture nodes should be generated
  assert(result.architectureNodes.length >= 2, `Architecture nodes generated (got ${result.architectureNodes.length})`);
  assert(result.architectureEdges.length >= 1, `Architecture edges generated (got ${result.architectureEdges.length})`);

  console.log(`\n  Score: ${result.score}/100`);
  console.log(`  Breakdown: ${Object.values(result.scoreBreakdown).map(b => `${b.label}: ${b.score}/${b.max}`).join(", ")}`);
  console.log(`  Architecture nodes: ${result.architectureNodes.map(n => n.label).join(" → ")}`);

  fs.rmSync(tmpDir, { recursive: true });
}

// ─── Test 4: Secret detection ──────────────────────────────────────────────

async function testSecretDetection() {
  section("Test 4: Secret detection in Dockerfile");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unwire-secret-test-"));
  fs.writeFileSync(path.join(tmpDir, "Dockerfile"), `FROM node:20
ENV API_KEY=sk-prod-abc123supersecretkey
ENV PASSWORD=mypassword123
COPY . .
CMD ["node", "app.js"]
`);

  const result = analyzeDeployment(tmpDir, []);
  const secretIssues = result.issues.filter(i => i.severity === "CRITICAL");

  assert(secretIssues.length > 0, "Critical issues found for secrets in Dockerfile");
  console.log(`\n  Critical issues: ${secretIssues.map(i => i.message).join("; ")}`);

  fs.rmSync(tmpDir, { recursive: true });
}

// ─── Test 5: Concurrent jobs don't block ──────────────────────────────────

async function testConcurrentAnalysis() {
  section("Test 5: Multiple concurrent analyses don't block");

  const sampleDir = path.join(__dirname, "sample-react-express");
  const start = Date.now();

  // Run 5 concurrent analyses
  await Promise.all([
    analyzeDeployment(sampleDir, ["React"]),
    analyzeDeployment(sampleDir, ["Express"]),
    analyzeDeployment(sampleDir, ["Vue"]),
    analyzeDeployment(sampleDir, ["FastAPI"]),
    analyzeDeployment(sampleDir, ["Django"]),
  ]);

  const elapsed = Date.now() - start;
  assert(elapsed < 10000, `5 concurrent analyses completed in < 10s (took ${elapsed}ms)`);
  console.log(`\n  Elapsed: ${elapsed}ms for 5 concurrent analyses`);
}

// ─── Runner ────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(60));
  console.log("  Unwire AI — Deployment Intelligence Tests");
  console.log("═".repeat(60));

  try {
    await testMissingDeployment();
    await testWithDocker();
    await testFullDeployment();
    await testSecretDetection();
    await testConcurrentAnalysis();
  } catch (err) {
    console.error("\n[FATAL]", err);
    process.exit(1);
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) process.exit(1);
}

main();
