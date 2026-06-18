/**
 * deploymentAnalyzer.ts
 *
 * Orchestrates:
 *  1. File detection
 *  2. Per-file analysis via rules
 *  3. Missing-file recommendations
 *  4. Deployment score calculation
 *  5. Architecture diagram node/edge generation
 *
 * This module is PURE — no DB access. The service layer persists results.
 * Heavy I/O happens in this module; it must be called from a background job.
 */

import fs from "fs";
import type { DetectedFile, DeploymentDetectionResult } from "./deploymentDetector";
import { detectDeploymentFiles } from "./deploymentDetector";
import { getRulesForFile, type Issue, type Severity } from "./deploymentRules";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ArchNode {
  id: string;
  label: string;
  sub: string;
  type: "user" | "proxy" | "container" | "backend" | "database" | "external" | "ci_cd" | "cloud";
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ScoreBreakdown {
  containerization: { score: number; max: number; label: string };
  ciCd:             { score: number; max: number; label: string };
  security:         { score: number; max: number; label: string };
  configuration:    { score: number; max: number; label: string };
}

export interface Recommendation {
  priority: number;       // 0 = highest
  title: string;
  description: string;
  category: string;
  codeSnippet: string;
}

export interface DeploymentAnalysisResult {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  filesDetected: DetectedFile[];
  issues: Issue[];
  recommendations: Recommendation[];
  architectureNodes: ArchNode[];
  architectureEdges: ArchEdge[];
  detection: DeploymentDetectionResult;
}

// ─── Main function ─────────────────────────────────────────────────────────

/**
 * analyzeDeployment
 *
 * @param projectRoot  Absolute path to the extracted project source
 * @param projectStack Known stack from code analysis (e.g. ["React", "Express", "MongoDB"])
 */
export function analyzeDeployment(
  projectRoot: string,
  projectStack: string[] = []
): DeploymentAnalysisResult {

  // ── Step 1: Detect ────────────────────────────────────────────────────────
  const detection = detectDeploymentFiles(projectRoot);

  // ── Step 2: Analyze each detected file ───────────────────────────────────
  const issues: Issue[] = [];

  for (const df of detection.files) {
    const rules = getRulesForFile(df.path);
    if (rules.length === 0) continue;

    let content = "";
    try {
      content = fs.readFileSync(df.absolutePath, "utf-8");
    } catch {
      continue;
    }

    for (const ruleFn of rules) {
      issues.push(...ruleFn(content, df.path));
    }
  }

  // ── Step 3: Missing-file recommendations ────────────────────────────────
  const recommendations = buildRecommendations(detection, projectStack);

  // ── Step 4: Score ────────────────────────────────────────────────────────
  const { score, breakdown } = calculateScore(detection, issues);

  // ── Step 5: Architecture diagram ─────────────────────────────────────────
  const { nodes, edges } = buildArchitectureDiagram(detection, projectStack);

  return {
    score,
    scoreBreakdown: breakdown,
    filesDetected: detection.files,
    issues,
    recommendations,
    architectureNodes: nodes,
    architectureEdges: edges,
    detection,
  };
}

// ─── Score calculation ─────────────────────────────────────────────────────

function calculateScore(
  d: DeploymentDetectionResult,
  issues: Issue[]
): { score: number; breakdown: ScoreBreakdown } {

  const criticalCount = issues.filter((i) => i.severity === "CRITICAL").length;
  const warningCount  = issues.filter((i) => i.severity === "WARNING").length;

  // Containerization (30 pts)
  let containerScore = 0;
  if (d.hasDocker)        containerScore += 18;
  if (d.hasDockerCompose) containerScore += 8;
  if (d.hasKubernetes)    containerScore += 4;

  // CI/CD (25 pts)
  let cicdScore = 0;
  if (d.hasGithubActions || d.hasGitlabCI) cicdScore += 20;
  if (d.files.some((f) => f.category === "ci_cd" && f.name !== "GitHub Actions workflow" && f.name !== ".gitlab-ci.yml")) cicdScore += 5;

  // Security (25 pts)
  let securityScore = 25;
  securityScore -= criticalCount * 8;
  securityScore -= warningCount * 3;
  if (d.hasNginx)     securityScore += 3;
  if (d.hasEnvExample) securityScore += 2;
  securityScore = Math.max(0, Math.min(25, securityScore));

  // Configuration (20 pts)
  let configScore = 0;
  if (d.hasEnvExample)    configScore += 8;
  if (d.hasPM2)           configScore += 4;
  if (d.hasFrontendBuild) configScore += 4;
  if (d.files.some((f) => f.category === "cloud")) configScore += 4;

  const total = containerScore + cicdScore + securityScore + configScore;

  return {
    score: Math.min(100, Math.max(0, total)),
    breakdown: {
      containerization: { score: containerScore, max: 30, label: "Containerization" },
      ciCd:             { score: cicdScore,       max: 25, label: "CI/CD" },
      security:         { score: securityScore,   max: 25, label: "Security" },
      configuration:    { score: configScore,     max: 20, label: "Configuration" },
    },
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────

function buildRecommendations(
  d: DeploymentDetectionResult,
  stack: string[]
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (!d.hasDocker) {
    const isNode = stack.some((s) => ["Express", "Fastify", "NestJS", "Node.js"].includes(s));
    const isPython = stack.some((s) => ["FastAPI", "Django", "Flask"].includes(s));

    recs.push({
      priority: 0,
      title: "Add Docker containerization",
      description:
        "Your project has no containerization strategy. Docker ensures consistent deployments " +
        "across development, staging, and production environments and is required for most cloud platforms.",
      category: "docker",
      codeSnippet: isNode
        ? `FROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine\nWORKDIR /app\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nEXPOSE 3000\nUSER node\nCMD ["node", "dist/server.js"]`
        : isPython
        ? `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0"]`
        : `FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nEXPOSE 3000\nCMD ["npm", "start"]`,
    });
  }

  if (!d.hasDockerCompose && d.hasDocker) {
    recs.push({
      priority: 1,
      title: "Add docker-compose for multi-service orchestration",
      description:
        "A docker-compose.yml lets you run your backend, frontend, and database together " +
        "with a single command. Essential for local development and staging environments.",
      category: "docker",
      codeSnippet: `version: '3.8'\nservices:\n  backend:\n    build: ./backend\n    ports:\n      - "5000:5000"\n    environment:\n      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp\n    depends_on:\n      db:\n        condition: service_healthy\n    restart: unless-stopped\n\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: myapp\n      POSTGRES_PASSWORD: password\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n\nvolumes:\n  pgdata:`,
    });
  }

  if (!d.hasGithubActions && !d.hasGitlabCI) {
    recs.push({
      priority: 2,
      title: "Set up CI/CD pipeline",
      description:
        "Automated CI/CD prevents broken code from reaching production. " +
        "GitHub Actions is free for public repos and easy to configure.",
      category: "ci_cd",
      codeSnippet: `name: CI\non:\n  push:\n    branches: [main, develop]\n  pull_request:\n    branches: [main]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n      - run: npm ci\n      - run: npm test\n      - run: npm run build`,
    });
  }

  if (!d.hasEnvExample) {
    recs.push({
      priority: 3,
      title: "Add .env.example for environment documentation",
      description:
        "A .env.example file documents required environment variables without exposing secrets. " +
        "It helps new developers set up the project and CI/CD pipelines configure correctly.",
      category: "environment",
      codeSnippet: `# Server\nPORT=3000\nNODE_ENV=production\n\n# Database\nDATABASE_URL=postgresql://user:password@localhost:5432/dbname\n\n# Auth\nJWT_SECRET=your-secret-here\n\n# External Services\n# STRIPE_SECRET_KEY=sk_live_...\n# OPENAI_API_KEY=sk-...`,
    });
  }

  if (!d.hasNginx && d.hasDocker) {
    recs.push({
      priority: 4,
      title: "Add Nginx as a reverse proxy",
      description:
        "Nginx in front of your application provides SSL termination, gzip compression, " +
        "request rate limiting, and static file serving — all critical for production.",
      category: "nginx",
      codeSnippet: `server {\n  listen 80;\n  server_name your-domain.com;\n  return 301 https://$host$request_uri;\n}\n\nserver {\n  listen 443 ssl;\n  server_name your-domain.com;\n\n  ssl_certificate /etc/nginx/ssl/cert.pem;\n  ssl_certificate_key /etc/nginx/ssl/key.pem;\n\n  add_header Strict-Transport-Security "max-age=31536000" always;\n  add_header X-Frame-Options DENY;\n\n  location / {\n    proxy_pass http://backend:3000;\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n  }\n}`,
    });
  }

  return recs;
}

// ─── Architecture diagram ─────────────────────────────────────────────────

function buildArchitectureDiagram(
  d: DeploymentDetectionResult,
  stack: string[]
): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  // Always: User node
  nodes.push({ id: "user", label: "Users", sub: "Browser / Mobile", type: "user" });

  // CI/CD
  if (d.hasGithubActions || d.hasGitlabCI) {
    nodes.push({
      id: "cicd", label: "CI/CD Pipeline",
      sub: d.hasGithubActions ? "GitHub Actions" : "GitLab CI",
      type: "ci_cd",
    });
    edges.push({ from: "user", to: "cicd", label: "push" });
  }

  // Reverse proxy
  if (d.hasNginx) {
    nodes.push({ id: "proxy", label: "Reverse Proxy", sub: "Nginx", type: "proxy" });
    edges.push({ from: "user", to: "proxy", label: "HTTPS" });
  }

  const prevId = d.hasNginx ? "proxy" : "user";

  // Container layer
  if (d.hasDocker || d.hasKubernetes) {
    const containerLabel = d.hasKubernetes ? "Kubernetes Cluster" : "Docker Container";
    const containerSub   = d.hasDockerCompose ? "docker-compose" : d.hasKubernetes ? "k8s" : "Docker";
    nodes.push({ id: "container", label: containerLabel, sub: containerSub, type: "container" });
    edges.push({ from: prevId, to: "container" });
  }

  const appParentId = d.hasDocker ? "container" : prevId;

  // Backend
  const beFramework = stack.find((s) =>
    ["Express", "Fastify", "NestJS", "FastAPI", "Django", "Flask", "Spring Boot"].includes(s)
  );
  if (beFramework) {
    nodes.push({ id: "backend", label: "Backend API", sub: beFramework, type: "backend" });
    edges.push({ from: appParentId, to: "backend" });
  }

  // Frontend (if static/SSR)
  const feFramework = stack.find((s) =>
    ["React", "Next.js", "Vue", "Angular", "Svelte"].includes(s)
  );
  if (feFramework && d.hasFrontendBuild) {
    nodes.push({ id: "frontend", label: "Frontend", sub: feFramework, type: "container" });
    edges.push({ from: appParentId, to: "frontend" });
  }

  // Database
  const DB_NAMES = ["MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis"];
  const db = stack.find((s) => DB_NAMES.includes(s));
  if (db) {
    nodes.push({ id: "db", label: "Database", sub: db, type: "database" });
    const dbParent = beFramework ? "backend" : appParentId;
    edges.push({ from: dbParent, to: "db" });
  }

  // Cloud platform
  const cloudFile = d.files.find((f) => f.category === "cloud");
  if (cloudFile) {
    nodes.push({ id: "cloud", label: "Cloud Platform", sub: cloudFile.name, type: "cloud" });
    if (d.hasGithubActions || d.hasGitlabCI) {
      edges.push({ from: "cicd", to: "cloud", label: "deploy" });
    }
  }

  return { nodes, edges };
}
