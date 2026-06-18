/**
 * deploymentDetector.ts
 *
 * Scans a project source directory for deployment-related configuration files.
 * Returns a structured detection result — does NOT do deep analysis, just finds files.
 * Fast enough to run synchronously; heavy analysis is done by deploymentAnalyzer.ts.
 */

import fs from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type DeploymentCategory =
  | "docker"
  | "kubernetes"
  | "nginx"
  | "ci_cd"
  | "terraform"
  | "cloud"
  | "node_pm2"
  | "frontend_build"
  | "environment"
  | "reverse_proxy";

export interface DetectedFile {
  name: string;
  path: string;        // relative to project root
  absolutePath: string;
  category: DeploymentCategory;
  size: number;
}

export interface DeploymentDetectionResult {
  // Presence flags
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasKubernetes: boolean;
  hasNginx: boolean;
  hasGithubActions: boolean;
  hasGitlabCI: boolean;
  hasTerraform: boolean;
  hasPM2: boolean;
  hasEnvExample: boolean;
  hasFrontendBuild: boolean;

  // All detected files with metadata
  files: DetectedFile[];

  // Summary status
  hasAnyDeployment: boolean;
  missingCritical: string[];   // list of recommended files that are absent
}

// ─── Detection map: filename/glob → category ───────────────────────────────

interface FilePattern {
  pattern: RegExp;       // matches the relative file path
  name: string;          // canonical display name
  category: DeploymentCategory;
}

const DEPLOYMENT_PATTERNS: FilePattern[] = [
  // Docker
  { pattern: /^(.*\/)?Dockerfile$/i,                  name: "Dockerfile",              category: "docker"         },
  { pattern: /^(.*\/)?Dockerfile\.\w+$/i,             name: "Dockerfile (variant)",    category: "docker"         },
  { pattern: /^(.*\/)?docker-compose\.ya?ml$/i,       name: "docker-compose.yml",      category: "docker"         },
  { pattern: /^(.*\/)?docker-compose\.\w+\.ya?ml$/i,  name: "docker-compose (variant)",category: "docker"         },
  { pattern: /^(.*\/)?.dockerignore$/i,                name: ".dockerignore",           category: "docker"         },

  // Kubernetes
  { pattern: /^(.*\/)?deployment\.ya?ml$/i,           name: "k8s deployment.yaml",     category: "kubernetes"     },
  { pattern: /^(.*\/)?service\.ya?ml$/i,              name: "k8s service.yaml",        category: "kubernetes"     },
  { pattern: /^(.*\/)?ingress\.ya?ml$/i,              name: "k8s ingress.yaml",        category: "kubernetes"     },
  { pattern: /^(.*\/)?configmap\.ya?ml$/i,            name: "k8s configmap.yaml",      category: "kubernetes"     },
  { pattern: /^(.*\/)?helm\//i,                       name: "Helm chart",              category: "kubernetes"     },

  // Nginx / Reverse proxy
  { pattern: /^(.*\/)?nginx\.conf$/i,                 name: "nginx.conf",              category: "nginx"          },
  { pattern: /^(.*\/)?nginx\//i,                      name: "nginx config dir",        category: "nginx"          },
  { pattern: /^(.*\/)?default\.conf$/i,               name: "nginx default.conf",      category: "nginx"          },

  // CI/CD - GitHub Actions
  { pattern: /^\.github\/workflows\//i,               name: "GitHub Actions workflow", category: "ci_cd"          },
  // CI/CD - GitLab
  { pattern: /^\.gitlab-ci\.ya?ml$/i,                 name: ".gitlab-ci.yml",          category: "ci_cd"          },
  // CI/CD - Others
  { pattern: /^\.circleci\//i,                        name: "CircleCI config",         category: "ci_cd"          },
  { pattern: /^(.*\/)?Jenkinsfile$/i,                 name: "Jenkinsfile",             category: "ci_cd"          },
  { pattern: /^(.*\/)?\.travis\.ya?ml$/i,             name: ".travis.yml",             category: "ci_cd"          },
  { pattern: /^(.*\/)?bitbucket-pipelines\.ya?ml$/i,  name: "Bitbucket Pipelines",     category: "ci_cd"          },

  // Terraform / IaC
  { pattern: /^(.*\/)?main\.tf$/i,                    name: "Terraform main.tf",       category: "terraform"      },
  { pattern: /^(.*\/)?\w+\.tf$/,                      name: "Terraform file",          category: "terraform"      },
  { pattern: /^(.*\/)?\w+\.tfvars$/,                  name: "Terraform vars",          category: "terraform"      },

  // Cloud-specific
  { pattern: /^(.*\/)?appspec\.ya?ml$/i,              name: "AWS CodeDeploy appspec",  category: "cloud"          },
  { pattern: /^(.*\/)?app\.ya?ml$/i,                  name: "App Engine app.yaml",     category: "cloud"          },
  { pattern: /^(.*\/)?serverless\.ya?ml$/i,           name: "Serverless Framework",    category: "cloud"          },
  { pattern: /^(.*\/)?fly\.toml$/i,                   name: "Fly.io fly.toml",         category: "cloud"          },
  { pattern: /^(.*\/)?railway\.ya?ml$/i,              name: "Railway config",          category: "cloud"          },
  { pattern: /^(.*\/)?render\.ya?ml$/i,               name: "Render config",           category: "cloud"          },
  { pattern: /^(.*\/)?heroku\.ya?ml$/i,               name: "Heroku config",           category: "cloud"          },
  { pattern: /^(.*\/)?Procfile$/,                     name: "Procfile (Heroku/PaaS)",  category: "cloud"          },
  { pattern: /^(.*\/)?vercel\.json$/i,                name: "Vercel vercel.json",      category: "cloud"          },
  { pattern: /^(.*\/)?netlify\.toml$/i,               name: "Netlify netlify.toml",    category: "cloud"          },

  // PM2 / Node process manager
  { pattern: /^(.*\/)?ecosystem\.config\.(js|cjs|ts)$/i, name: "PM2 ecosystem.config.js", category: "node_pm2"  },
  { pattern: /^(.*\/)?pm2\.config\.(js|cjs|ts)$/i,   name: "PM2 config",              category: "node_pm2"       },

  // Frontend build
  { pattern: /^(.*\/)?vite\.config\.(ts|js|mjs)$/i,  name: "vite.config.ts",          category: "frontend_build" },
  { pattern: /^(.*\/)?next\.config\.(ts|js|mjs)$/i,  name: "next.config.js",          category: "frontend_build" },
  { pattern: /^(.*\/)?webpack\.config\.(ts|js)$/i,   name: "webpack.config.js",       category: "frontend_build" },

  // Environment
  { pattern: /^(.*\/)?\.env\.example$/i,              name: ".env.example",            category: "environment"    },
  { pattern: /^(.*\/)?\.env\.production$/i,           name: ".env.production",         category: "environment"    },
  { pattern: /^(.*\/)?\.env\.staging$/i,              name: ".env.staging",            category: "environment"    },
];

// ─── Ignored directories ────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "venv", ".venv", "coverage", "target", ".gradle",
]);

// ─── Main function ─────────────────────────────────────────────────────────

/**
 * detectDeploymentFiles
 *
 * @param projectRoot  Absolute path to the extracted project source directory
 * @returns            DeploymentDetectionResult
 */
export function detectDeploymentFiles(projectRoot: string): DeploymentDetectionResult {
  if (!fs.existsSync(projectRoot)) {
    return emptyResult();
  }

  const allFiles = walkFiles(projectRoot, projectRoot);
  const detected: DetectedFile[] = [];

  for (const relPath of allFiles) {
    for (const pattern of DEPLOYMENT_PATTERNS) {
      if (pattern.pattern.test(relPath)) {
        const absPath = path.join(projectRoot, relPath);
        let size = 0;
        try { size = fs.statSync(absPath).size; } catch { /* skip */ }

        detected.push({
          name:         pattern.name,
          path:         relPath,
          absolutePath: absPath,
          category:     pattern.category,
          size,
        });
        break; // one match per file is enough
      }
    }
  }

  // Deduplicate by absolute path
  const seen = new Set<string>();
  const unique = detected.filter((f) => {
    if (seen.has(f.absolutePath)) return false;
    seen.add(f.absolutePath);
    return true;
  });

  // Derive presence flags
  const cats = new Set(unique.map((f) => f.category));
  const hasDocker          = unique.some((f) => f.name === "Dockerfile");
  const hasDockerCompose   = unique.some((f) => f.name.startsWith("docker-compose"));
  const hasKubernetes      = cats.has("kubernetes");
  const hasNginx           = cats.has("nginx") || cats.has("reverse_proxy");
  const hasGithubActions   = unique.some((f) => f.name === "GitHub Actions workflow");
  const hasGitlabCI        = unique.some((f) => f.name === ".gitlab-ci.yml");
  const hasTerraform       = cats.has("terraform");
  const hasPM2             = cats.has("node_pm2");
  const hasEnvExample      = unique.some((f) => f.name === ".env.example");
  const hasFrontendBuild   = cats.has("frontend_build");

  // Critical missing files
  const missingCritical: string[] = [];
  if (!hasDocker && !hasKubernetes && !cats.has("cloud"))
    missingCritical.push("Dockerfile (no containerization strategy found)");
  if (!hasGithubActions && !hasGitlabCI && !cats.has("ci_cd"))
    missingCritical.push("CI/CD pipeline (.github/workflows or .gitlab-ci.yml)");
  if (!hasEnvExample)
    missingCritical.push(".env.example (environment variable documentation)");

  return {
    hasDocker, hasDockerCompose, hasKubernetes, hasNginx,
    hasGithubActions, hasGitlabCI, hasTerraform, hasPM2,
    hasEnvExample, hasFrontendBuild,
    files: unique,
    hasAnyDeployment: unique.length > 0,
    missingCritical,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function emptyResult(): DeploymentDetectionResult {
  return {
    hasDocker: false, hasDockerCompose: false, hasKubernetes: false,
    hasNginx: false, hasGithubActions: false, hasGitlabCI: false,
    hasTerraform: false, hasPM2: false, hasEnvExample: false,
    hasFrontendBuild: false, files: [], hasAnyDeployment: false,
    missingCritical: [
      "Dockerfile",
      "CI/CD pipeline",
      ".env.example",
    ],
  };
}

function walkFiles(root: string, current: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(current, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;

    const abs = path.join(current, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      results.push(...walkFiles(root, abs));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}
