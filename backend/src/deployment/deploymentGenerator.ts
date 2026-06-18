/**
 * deploymentGenerator.ts
 *
 * Generates production-ready deployment configuration files from a DeploymentPlan.
 * Pure function — takes a plan, returns file contents as strings.
 * No filesystem writes here; the pipeline writes files to the server via agent.
 */

import type { DeploymentPlan } from "./deploymentPlanner";

export interface GeneratedFiles {
  "Dockerfile":           string;
  "docker-compose.yml":   string;
  "nginx.conf":           string;
  ".env.example":         string;
  ".dockerignore":        string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export function generateDeploymentFiles(plan: DeploymentPlan, projectName: string): GeneratedFiles {
  return {
    "Dockerfile":         generateDockerfile(plan),
    "docker-compose.yml": generateDockerCompose(plan, projectName),
    "nginx.conf":         generateNginxConf(plan, projectName),
    ".env.example":       generateEnvExample(plan),
    ".dockerignore":      generateDockerIgnore(plan),
  };
}

// ─── Dockerfile ────────────────────────────────────────────────────────────

function generateDockerfile(plan: DeploymentPlan): string {
  if (plan.runtime === "node") return generateNodeDockerfile(plan);
  if (plan.runtime === "python") return generatePythonDockerfile(plan);
  if (plan.runtime === "java") return generateJavaDockerfile(plan);
  return generateNodeDockerfile(plan); // fallback
}

function generateNodeDockerfile(plan: DeploymentPlan): string {
  const hasBuild = !!plan.buildCommand;
  const lines: string[] = [];

  if (hasBuild) {
    // Multi-stage build
    lines.push(
      `# ─── Build stage ───────────────────────────────────────────────────────────`,
      `FROM node:20-alpine AS builder`,
      `WORKDIR /app`,
      ``,
      `# Install dependencies first (layer cache)`,
      `COPY package*.json ./`,
      `RUN npm ci`,
      ``,
      `COPY . .`,
      `RUN ${plan.buildCommand}`,
      ``,
      `# ─── Runtime stage ─────────────────────────────────────────────────────────`,
      `FROM node:20-alpine`,
      `WORKDIR /app`,
      ``,
      `ENV NODE_ENV=production`,
      ``,
      `COPY package*.json ./`,
      `RUN npm ci --only=production`,
      `COPY --from=builder /app/dist ./dist`,
      ``,
      `EXPOSE ${plan.port}`,
      `USER node`,
      `CMD ["${plan.startCommand.replace("npm start", "node dist/server.js")}"]`,
    );
  } else {
    lines.push(
      `FROM node:20-alpine`,
      `WORKDIR /app`,
      ``,
      `ENV NODE_ENV=production`,
      ``,
      `COPY package*.json ./`,
      `RUN npm ci --only=production`,
      ``,
      `COPY . .`,
      ``,
      `EXPOSE ${plan.port}`,
      `USER node`,
      `CMD ["npm", "start"]`,
    );
  }

  return lines.join("\n");
}

function generatePythonDockerfile(plan: DeploymentPlan): string {
  return [
    `FROM python:3.12-slim`,
    `WORKDIR /app`,
    ``,
    `ENV PYTHONDONTWRITEBYTECODE=1 \\`,
    `    PYTHONUNBUFFERED=1`,
    ``,
    `COPY requirements.txt .`,
    `RUN pip install --no-cache-dir -r requirements.txt`,
    ``,
    `COPY . .`,
    ``,
    `EXPOSE ${plan.port}`,
    `CMD ["${plan.startCommand.split(" ")[0]}", ${plan.startCommand.split(" ").slice(1).map(s => `"${s}"`).join(", ")}]`,
  ].join("\n");
}

function generateJavaDockerfile(plan: DeploymentPlan): string {
  return [
    `FROM eclipse-temurin:21-jdk-alpine AS builder`,
    `WORKDIR /app`,
    `COPY . .`,
    `RUN ./mvnw clean package -DskipTests`,
    ``,
    `FROM eclipse-temurin:21-jre-alpine`,
    `WORKDIR /app`,
    `COPY --from=builder /app/target/*.jar app.jar`,
    `EXPOSE ${plan.port}`,
    `ENTRYPOINT ["java", "-jar", "app.jar"]`,
  ].join("\n");
}

// ─── docker-compose.yml ────────────────────────────────────────────────────

function generateDockerCompose(plan: DeploymentPlan, projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const services: string[] = [];

  // App service
  services.push(
    `  app:`,
    `    build: .`,
    `    container_name: ${slug}-app`,
    `    restart: unless-stopped`,
    `    ports:`,
    `      - "${plan.port}:${plan.port}"`,
    `    env_file:`,
    `      - .env`,
    plan.database ? `    depends_on:\n      db:\n        condition: service_healthy` : "",
    `    networks:`,
    `      - ${slug}-net`,
  );

  // Database services
  if (plan.database === "PostgreSQL") {
    services.push(
      ``,
      `  db:`,
      `    image: postgres:16-alpine`,
      `    container_name: ${slug}-db`,
      `    restart: unless-stopped`,
      `    environment:`,
      `      POSTGRES_DB: ${slug}`,
      `      POSTGRES_USER: \${DB_USER:-postgres}`,
      `      POSTGRES_PASSWORD: \${DB_PASSWORD}`,
      `    volumes:`,
      `      - pgdata:/var/lib/postgresql/data`,
      `    healthcheck:`,
      `      test: ["CMD-SHELL", "pg_isready -U postgres"]`,
      `      interval: 10s`,
      `      timeout: 5s`,
      `      retries: 5`,
      `    networks:`,
      `      - ${slug}-net`,
    );
  } else if (plan.database === "MongoDB") {
    services.push(
      ``,
      `  db:`,
      `    image: mongo:7`,
      `    container_name: ${slug}-mongo`,
      `    restart: unless-stopped`,
      `    volumes:`,
      `      - mongodata:/data/db`,
      `    healthcheck:`,
      `      test: ["CMD","mongosh","--eval","db.adminCommand('ping')"]`,
      `      interval: 10s`,
      `      retries: 5`,
      `    networks:`,
      `      - ${slug}-net`,
    );
  }

  // Redis
  if (plan.detectedServices.includes("Redis")) {
    services.push(
      ``,
      `  redis:`,
      `    image: redis:7-alpine`,
      `    container_name: ${slug}-redis`,
      `    restart: unless-stopped`,
      `    networks:`,
      `      - ${slug}-net`,
    );
  }

  // Volumes
  const volumes: string[] = [];
  if (plan.database === "PostgreSQL") volumes.push("  pgdata:");
  if (plan.database === "MongoDB")    volumes.push("  mongodata:");

  return [
    `version: '3.8'`,
    ``,
    `services:`,
    services.filter(Boolean).join("\n"),
    ``,
    `networks:`,
    `  ${slug}-net:`,
    `    driver: bridge`,
    volumes.length > 0 ? `\nvolumes:\n${volumes.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

// ─── nginx.conf ────────────────────────────────────────────────────────────

function generateNginxConf(plan: DeploymentPlan, projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  return [
    `# Nginx reverse proxy for ${projectName}`,
    `# Generated by Unwire AI`,
    ``,
    `upstream ${slug}_backend {`,
    `    server app:${plan.port};`,
    `    keepalive 32;`,
    `}`,
    ``,
    `server {`,
    `    listen 80;`,
    `    server_name _;`,
    `    return 301 https://$host$request_uri;`,
    `}`,
    ``,
    `server {`,
    `    listen 443 ssl http2;`,
    `    server_name your-domain.com;`,
    ``,
    `    ssl_certificate     /etc/nginx/ssl/fullchain.pem;`,
    `    ssl_certificate_key /etc/nginx/ssl/privkey.pem;`,
    `    ssl_protocols       TLSv1.2 TLSv1.3;`,
    `    ssl_ciphers         HIGH:!aNULL:!MD5;`,
    ``,
    `    # Security headers`,
    `    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
    `    add_header X-Frame-Options DENY;`,
    `    add_header X-Content-Type-Options nosniff;`,
    `    add_header X-XSS-Protection "1; mode=block";`,
    ``,
    `    # Gzip`,
    `    gzip on;`,
    `    gzip_types text/plain text/css application/json application/javascript;`,
    ``,
    `    # Rate limiting`,
    `    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;`,
    ``,
    `    location / {`,
    `        limit_req zone=api burst=20 nodelay;`,
    `        proxy_pass         http://${slug}_backend;`,
    `        proxy_http_version 1.1;`,
    `        proxy_set_header   Upgrade $http_upgrade;`,
    `        proxy_set_header   Connection 'upgrade';`,
    `        proxy_set_header   Host $host;`,
    `        proxy_set_header   X-Real-IP $remote_addr;`,
    `        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header   X-Forwarded-Proto $scheme;`,
    `        proxy_cache_bypass $http_upgrade;`,
    `        proxy_read_timeout 60s;`,
    `    }`,
    `}`,
  ].join("\n");
}

// ─── .env.example ─────────────────────────────────────────────────────────

function generateEnvExample(plan: DeploymentPlan): string {
  const lines = [
    `# Environment variables for ${plan.backendFramework ?? plan.frontendFramework ?? "this project"}`,
    `# Generated by Unwire AI — fill in real values before deploying`,
    `# NEVER commit real secrets to version control`,
    ``,
  ];

  for (const v of plan.environmentVariables) {
    lines.push(`# ${v.description}${v.required ? " (required)" : " (optional)"}`);
    lines.push(`${v.key}=${v.example}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─── .dockerignore ────────────────────────────────────────────────────────

function generateDockerIgnore(plan: DeploymentPlan): string {
  return [
    `node_modules`,
    `npm-debug.log`,
    `.git`,
    `.gitignore`,
    `.env`,
    `.env.*`,
    `!.env.example`,
    `dist`,
    `build`,
    `.next`,
    `coverage`,
    `*.test.*`,
    `*.spec.*`,
    `README.md`,
    `Dockerfile`,
    `docker-compose.yml`,
    `.dockerignore`,
  ].join("\n");
}
