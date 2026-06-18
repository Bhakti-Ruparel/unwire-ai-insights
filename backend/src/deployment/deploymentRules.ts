/**
 * deploymentRules.ts
 *
 * All analysis rules for deployment files.
 * Each rule is a pure function: (content, filePath) → Issue[]
 *
 * Adding a new rule = add a function here and register it in RULE_MAP.
 * Nothing else needs to change.
 */

import type { DeploymentCategory } from "./deploymentDetector";

// ─── Types ─────────────────────────────────────────────────────────────────

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface Issue {
  severity: Severity;
  category: DeploymentCategory;
  message: string;
  file: string;
  line?: number;
  suggestion: string;
}

// ─── Secret detection ──────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /password\s*[=:]\s*["']?[^\s"']{4,}/i,
  /api[_-]?key\s*[=:]\s*["']?[^\s"']{8,}/i,
  /secret\s*[=:]\s*["']?[^\s"']{8,}/i,
  /token\s*[=:]\s*["']?[^\s"']{8,}/i,
  /private[_-]?key\s*[=:]\s*["']?[^\s"']{8,}/i,
  /aws[_-]?secret/i,
  /-----BEGIN.*PRIVATE KEY-----/,
  /sk-[a-zA-Z0-9]{20,}/,           // OpenAI-style keys
  /ghp_[a-zA-Z0-9]{36}/,            // GitHub personal access tokens
];

function detectSecrets(content: string, file: string): Issue[] {
  const issues: Issue[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const p of SECRET_PATTERNS) {
      if (p.test(lines[i])) {
        issues.push({
          severity:   "CRITICAL",
          category:   "docker",
          message:    `Potential secret or credential found on line ${i + 1}`,
          file,
          line:       i + 1,
          suggestion: "Never hardcode secrets. Use environment variables or a secrets manager.",
        });
        break;
      }
    }
  }
  return issues;
}

// ─── Dockerfile rules ──────────────────────────────────────────────────────

export function analyzeDockerfile(content: string, file: string): Issue[] {
  const issues: Issue[] = [];
  const lines = content.split("\n");

  const hasFrom      = /^FROM\s+/im.test(content);
  const hasLatestTag = /^FROM\s+\S+:latest/im.test(content);
  const hasNodeFrom  = /^FROM\s+node(\s|:|$)/im.test(content);
  const hasNpmInstall= /RUN\s+npm\s+install(?!\s+--)/i.test(content);
  const hasNpmCi     = /RUN\s+npm\s+ci/i.test(content);
  const hasExpose    = /^EXPOSE\s+/im.test(content);
  const hasUser      = /^USER\s+/im.test(content);
  const hasCopyAll   = /^COPY\s+\.\s+\./im.test(content);
  const hasDockerIgnore = content.includes(".dockerignore");

  if (!hasFrom) {
    issues.push({
      severity: "CRITICAL", category: "docker", file,
      message: "Dockerfile is missing a FROM instruction.",
      suggestion: "Add a FROM instruction with a specific version tag, e.g. FROM node:20-alpine",
    });
  }

  if (hasLatestTag) {
    issues.push({
      severity: "WARNING", category: "docker", file,
      message: "Using :latest tag is not recommended for production.",
      suggestion: "Pin to a specific version e.g. FROM node:20-alpine to ensure reproducible builds.",
    });
  }

  if (hasNodeFrom && hasNpmInstall && !hasNpmCi) {
    issues.push({
      severity: "WARNING", category: "docker", file,
      message: "Using `npm install` instead of `npm ci` in Docker build.",
      suggestion: "Use `RUN npm ci --only=production` for faster, reproducible, production-safe installs.",
    });
  }

  if (!hasExpose) {
    issues.push({
      severity: "INFO", category: "docker", file,
      message: "No EXPOSE instruction found.",
      suggestion: "Add EXPOSE <port> to document which port the container listens on.",
    });
  }

  if (!hasUser) {
    issues.push({
      severity: "WARNING", category: "docker", file,
      message: "Container runs as root (no USER instruction).",
      suggestion: "Add `USER node` or create a non-root user to follow the principle of least privilege.",
    });
  }

  if (hasCopyAll) {
    issues.push({
      severity: "INFO", category: "docker", file,
      message: "Using `COPY . .` copies everything including .env files and node_modules.",
      suggestion: "Add a .dockerignore file to exclude node_modules, .env, dist, and .git.",
    });
  }

  // Check for multi-stage builds
  const fromCount = (content.match(/^FROM\s+/gim) || []).length;
  if (fromCount === 1 && hasNodeFrom) {
    issues.push({
      severity: "INFO", category: "docker", file,
      message: "Single-stage Dockerfile — consider multi-stage builds.",
      suggestion: "Multi-stage builds reduce final image size significantly. Use a builder stage and a slim runtime stage.",
    });
  }

  issues.push(...detectSecrets(content, file));

  return issues;
}

// ─── docker-compose rules ──────────────────────────────────────────────────

export function analyzeDockerCompose(content: string, file: string): Issue[] {
  const issues: Issue[] = [];

  const hasVersion      = /^version:/im.test(content);
  const hasHealthCheck  = /healthcheck:/i.test(content);
  const hasNetworks     = /networks:/i.test(content);
  const hasVolumes      = /volumes:/i.test(content);
  const hasEnvFile      = /env_file:/i.test(content);
  const hasDatabaseSvc  = /postgres|mysql|mongodb|redis/i.test(content);
  const hasDatabaseUrl  = /DATABASE_URL|MONGO_URI|REDIS_URL/i.test(content);
  const hasRestartPolicy= /restart:/i.test(content);
  const exposesPort     = /ports:/i.test(content);

  if (!hasHealthCheck && hasDatabaseSvc) {
    issues.push({
      severity: "WARNING", category: "docker", file,
      message: "Database service has no health check configured.",
      suggestion: "Add `healthcheck:` to database services so dependent services wait for readiness.",
    });
  }

  if (hasDatabaseSvc && !hasDatabaseUrl) {
    issues.push({
      severity: "WARNING", category: "docker", file,
      message: "Database service detected but DATABASE_URL / connection string not found in environment.",
      suggestion: "Add DATABASE_URL (or similar) to your service's environment section.",
    });
  }

  if (!hasRestartPolicy) {
    issues.push({
      severity: "INFO", category: "docker", file,
      message: "No restart policy configured for services.",
      suggestion: "Add `restart: unless-stopped` to keep services running after crashes.",
    });
  }

  if (!hasNetworks) {
    issues.push({
      severity: "INFO", category: "docker", file,
      message: "No custom networks defined — services use the default bridge network.",
      suggestion: "Define named networks for better service isolation and DNS resolution.",
    });
  }

  issues.push(...detectSecrets(content, file));

  return issues;
}

// ─── nginx rules ──────────────────────────────────────────────────────────

export function analyzeNginxConfig(content: string, file: string): Issue[] {
  const issues: Issue[] = [];

  const hasSSL       = /ssl_certificate|listen\s+443/i.test(content);
  const hasHSTS      = /Strict-Transport-Security/i.test(content);
  const hasGzip      = /gzip\s+on/i.test(content);
  const hasRateLimit = /limit_req/i.test(content);
  const hasProxyPass = /proxy_pass/i.test(content);
  const hasUpstream  = /upstream\s+/i.test(content);
  const hasSecHeaders= /X-Frame-Options|X-Content-Type-Options/i.test(content);

  if (!hasSSL) {
    issues.push({
      severity: "WARNING", category: "nginx", file,
      message: "HTTPS is not configured in nginx.",
      suggestion: "Add SSL certificate configuration with `ssl_certificate` and `ssl_certificate_key` directives. Use Let's Encrypt for free certificates.",
    });
  }

  if (hasSSL && !hasHSTS) {
    issues.push({
      severity: "WARNING", category: "nginx", file,
      message: "HSTS (HTTP Strict Transport Security) header is not set.",
      suggestion: "Add `add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;`",
    });
  }

  if (!hasSecHeaders) {
    issues.push({
      severity: "WARNING", category: "nginx", file,
      message: "Security headers (X-Frame-Options, X-Content-Type-Options) are missing.",
      suggestion: "Add security headers to prevent clickjacking and MIME-type sniffing attacks.",
    });
  }

  if (!hasGzip) {
    issues.push({
      severity: "INFO", category: "nginx", file,
      message: "Gzip compression is not enabled.",
      suggestion: "Enable `gzip on;` to reduce response sizes by 60-80%.",
    });
  }

  if (!hasRateLimit && hasProxyPass) {
    issues.push({
      severity: "INFO", category: "nginx", file,
      message: "No rate limiting configured.",
      suggestion: "Use `limit_req_zone` and `limit_req` to protect against DDoS and brute-force attacks.",
    });
  }

  return issues;
}

// ─── GitHub Actions rules ─────────────────────────────────────────────────

export function analyzeGithubWorkflow(content: string, file: string): Issue[] {
  const issues: Issue[] = [];

  const hasBuildStep  = /run:.*(?:npm run build|yarn build|cargo build|go build)/i.test(content);
  const hasTestStep   = /run:.*(?:npm test|npm run test|yarn test|pytest|go test)/i.test(content);
  const hasLintStep   = /run:.*(?:eslint|prettier|flake8|golint)/i.test(content);
  const hasDeployStep = /deploy|release|publish/i.test(content);
  const hasSecrets    = /\$\{\{\s*secrets\./i.test(content);
  const hasCaching    = /actions\/cache|cache:/i.test(content);
  const hasPinned     = /uses:.*@v\d|uses:.*@[a-f0-9]{40}/i.test(content);

  if (!hasTestStep) {
    issues.push({
      severity: "WARNING", category: "ci_cd", file,
      message: "No test step found in the CI/CD workflow.",
      suggestion: "Add a test step (e.g. `npm test`) to catch regressions before deployment.",
    });
  }

  if (!hasBuildStep && !hasDeployStep) {
    issues.push({
      severity: "WARNING", category: "ci_cd", file,
      message: "No build or deployment step found in the workflow.",
      suggestion: "Add a build step and a deployment step to automate your release process.",
    });
  }

  if (!hasCaching) {
    issues.push({
      severity: "INFO", category: "ci_cd", file,
      message: "Dependency caching is not configured — workflows may run slowly.",
      suggestion: "Use `actions/cache` to cache node_modules or pip packages between runs.",
    });
  }

  if (!hasPinned) {
    issues.push({
      severity: "INFO", category: "ci_cd", file,
      message: "Actions are not pinned to specific SHA hashes.",
      suggestion: "Pin third-party actions to full commit SHAs (e.g. `actions/checkout@a81bbbf`) for security.",
    });
  }

  return issues;
}

// ─── Kubernetes rules ─────────────────────────────────────────────────────

export function analyzeKubernetesManifest(content: string, file: string): Issue[] {
  const issues: Issue[] = [];

  const hasResourceLimits= /resources:\s*\n\s*limits/i.test(content);
  const hasLiveness      = /livenessProbe/i.test(content);
  const hasReadiness     = /readinessProbe/i.test(content);
  const hasSecurityCtx   = /securityContext/i.test(content);
  const hasLatest        = /image:.*:latest/i.test(content);

  if (!hasResourceLimits) {
    issues.push({
      severity: "WARNING", category: "kubernetes", file,
      message: "No resource limits defined for containers.",
      suggestion: "Set `resources.limits.cpu` and `resources.limits.memory` to prevent resource starvation.",
    });
  }

  if (!hasLiveness) {
    issues.push({
      severity: "WARNING", category: "kubernetes", file,
      message: "No liveness probe configured.",
      suggestion: "Add a `livenessProbe` so Kubernetes can restart unhealthy pods automatically.",
    });
  }

  if (!hasReadiness) {
    issues.push({
      severity: "WARNING", category: "kubernetes", file,
      message: "No readiness probe configured.",
      suggestion: "Add a `readinessProbe` so Kubernetes only routes traffic to ready pods.",
    });
  }

  if (hasLatest) {
    issues.push({
      severity: "WARNING", category: "kubernetes", file,
      message: "Using :latest image tag in Kubernetes manifest.",
      suggestion: "Pin images to specific digest or version tags for reproducible deployments.",
    });
  }

  return issues;
}

// ─── Rule dispatcher ─────────────────────────────────────────────────────

type RuleFn = (content: string, file: string) => Issue[];

export function getRulesForFile(filePath: string): RuleFn[] {
  const lower = filePath.toLowerCase();
  const base  = filePath.split("/").pop()?.toLowerCase() ?? "";

  if (base === "dockerfile" || base.startsWith("dockerfile."))  return [analyzeDockerfile];
  if (base.startsWith("docker-compose"))                        return [analyzeDockerCompose];
  if (base === "nginx.conf" || base === "default.conf")         return [analyzeNginxConfig];
  if (lower.includes(".github/workflows"))                      return [analyzeGithubWorkflow];
  if (lower.includes("gitlab-ci"))                              return [analyzeGithubWorkflow]; // similar rules
  if (base === "deployment.yaml" || base === "service.yaml")    return [analyzeKubernetesManifest];

  return [];
}
