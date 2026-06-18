/**
 * apiAnalyzer.ts
 *
 * Static-analysis API detector.
 * Reads source files as text and uses regex patterns to detect:
 *  - Express route definitions  (app.get / router.post / app.use / etc.)
 *  - FastAPI route decorators   (@app.get / @router.post / etc.)
 *  - Django URL patterns        (path("…", view))
 *  - Spring Boot annotations    (@GetMapping / @PostMapping / etc.)
 *  - Frontend fetch/axios calls (fetch("…") / axios.get("…"))
 *
 * Also captures middleware names from Express route definitions.
 *
 * No AST parser required — good enough for route discovery.
 */

import fs from "fs";
import type { ScannedFile } from "./codeScanner";
import type { APIEndpointDTO } from "../models/Project";

// ─── Types ─────────────────────────────────────────────────────────────────

type HttpMethod = APIEndpointDTO["method"];

interface RawRoute {
  method: HttpMethod;
  path: string;
  file: string;
  description: string;
  authenticated: boolean;
  middleware: string[];
}

// ─── Extension groups ──────────────────────────────────────────────────────

const JS_EXTS = new Set(["js", "ts", "jsx", "tsx", "mjs", "cjs"]);
const PY_EXTS = new Set(["py"]);
const JAVA_EXTS = new Set(["java", "kt"]);

// ─── Patterns ──────────────────────────────────────────────────────────────

/**
 * Express / Koa / Hono  →  router.METHOD("path", middleware?, handler)
 * Matches:  app.get('/users', ...)
 *           router.post('/auth/login', authMiddleware, controller.login)
 *           this.router.delete('/items/:id', ...)
 *           app.use('/api', router)
 */
const EXPRESS_RE =
  /(?:app|router|this\.router)\.(get|post|put|patch|delete|head|options|use)\s*\(\s*['"`]([^'"`]+)['"`]([\s\S]*?)\)/gi;

/**
 * FastAPI  →  @app.METHOD("path")  or  @router.METHOD("path")
 */
const FASTAPI_RE =
  /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;

/**
 * Django  →  path("route", view)  or  re_path("regex", view)
 * We emit GET as a placeholder since Django doesn't encode method in urls.py.
 */
const DJANGO_RE = /(?:path|re_path)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/gi;

/**
 * Spring Boot  →  @GetMapping("/path")  @PostMapping("/path")  etc.
 */
const SPRING_METHOD_RE =
  /@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/gi;

/**
 * Frontend fetch/axios calls in JS/TS files:
 *   fetch('/api/users')
 *   axios.get('/api/items')
 *   axios.post('/api/orders', data)
 */
const FETCH_RE = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const AXIOS_RE =
  /axios\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * analyzeAPIs
 *
 * Iterates over scanned files, runs pattern matchers, deduplicates results,
 * and returns a list of discovered API endpoints.
 */
export function analyzeAPIs(files: ScannedFile[]): Omit<APIEndpointDTO, "id">[] {
  const routes: RawRoute[] = [];

  for (const file of files) {
    const ext = file.extension.toLowerCase();

    // Skip non-source files and known binary/asset types
    if (["png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot", "pdf"].includes(ext)) continue;
    // Skip very large files (> 500 KB) — unlikely to be route files
    if (file.size > 500_000) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.absolutePath, "utf-8");
    } catch {
      continue; // binary or permission error
    }

    if (JS_EXTS.has(ext)) {
      routes.push(...extractExpressRoutes(content, file.relativePath));
      routes.push(...extractFetchCalls(content, file.relativePath));
      routes.push(...extractAxiosCalls(content, file.relativePath));
    }

    if (PY_EXTS.has(ext)) {
      routes.push(...extractFastAPIRoutes(content, file.relativePath));
      routes.push(...extractDjangoRoutes(content, file.relativePath));
    }

    if (JAVA_EXTS.has(ext)) {
      routes.push(...extractSpringRoutes(content, file.relativePath));
    }
  }

  // Deduplicate: same method + path + file
  const seen = new Set<string>();
  const unique = routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map((r, i) => ({
    id: String(i + 1),
    method: r.method,
    path: r.path,
    file: r.file,
    usage: 0,
    description: r.description,
    authenticated: r.authenticated,
    middleware: r.middleware,
  }));
}

// ─── Extractors ────────────────────────────────────────────────────────────

function extractExpressRoutes(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  EXPRESS_RE.lastIndex = 0;
  while ((m = EXPRESS_RE.exec(content)) !== null) {
    const verb = m[1].toUpperCase();
    // app.use is not a route verb — skip unless there's a path that looks like a route
    if (verb === "USE") continue;

    const method = verb as HttpMethod;
    const routePath = m[2];
    if (shouldSkipPath(routePath)) continue;

    const afterPath = m[3] ?? "";
    const authHint = hasAuthGuard(content, m.index);
    const middlewareNames = extractMiddlewareNames(afterPath);

    routes.push({
      method,
      path: normalizeExpressPath(routePath),
      file,
      description: buildDescription(method, routePath),
      authenticated: authHint || middlewareNames.some((mw) => /auth|verify|protect|guard|jwt|bearer/i.test(mw)),
      middleware: middlewareNames,
    });
  }

  return routes;
}

/**
 * Extract middleware function names from the argument string after the route path.
 * e.g.  ", authMiddleware, validate(schema), controller.login"
 * → ["authMiddleware", "validate", "controller.login"]
 */
function extractMiddlewareNames(afterPath: string): string[] {
  const names: string[] = [];
  // Match identifier.identifier or identifier (not the last argument which is the handler)
  const identRe = /,\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*(?:\([^)]*\))?(?=\s*,)/g;
  let m: RegExpExecArray | null;
  while ((m = identRe.exec(afterPath)) !== null) {
    const name = m[1];
    // Skip common non-middleware identifiers
    if (!["req", "res", "next", "err", "data", "result"].includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function extractFastAPIRoutes(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  FASTAPI_RE.lastIndex = 0;
  while ((m = FASTAPI_RE.exec(content)) !== null) {
    const method = m[1].toUpperCase() as HttpMethod;
    const routePath = m[2];
    if (shouldSkipPath(routePath)) continue;

    routes.push({
      method,
      path: routePath,
      file,
      description: buildDescription(method, routePath),
      authenticated: content.includes("Depends(") && content.includes("get_current_user"),
      middleware: [],
    });
  }

  return routes;
}

function extractDjangoRoutes(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  DJANGO_RE.lastIndex = 0;
  while ((m = DJANGO_RE.exec(content)) !== null) {
    const routePath = "/" + m[1].replace(/^\//, "");
    if (shouldSkipPath(routePath)) continue;

    routes.push({
      method: "GET",
      path: routePath,
      file,
      description: `Django view: ${m[2]}`,
      authenticated: false,
      middleware: [],
    });
  }

  return routes;
}

function extractSpringRoutes(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  SPRING_METHOD_RE.lastIndex = 0;
  while ((m = SPRING_METHOD_RE.exec(content)) !== null) {
    const annotationType = m[1].toUpperCase();
    const method: HttpMethod =
      annotationType === "REQUEST" ? "GET" : (annotationType as HttpMethod);
    const routePath = m[2];
    if (shouldSkipPath(routePath)) continue;

    routes.push({
      method,
      path: routePath,
      file,
      description: buildDescription(method, routePath),
      authenticated: content.includes("@PreAuthorize") || content.includes("@Secured"),
      middleware: [],
    });
  }

  return routes;
}

function extractFetchCalls(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  FETCH_RE.lastIndex = 0;
  while ((m = FETCH_RE.exec(content)) !== null) {
    const url = m[1];
    if (!url.startsWith("/") && !url.startsWith("http")) continue;
    if (shouldSkipPath(url)) continue;

    routes.push({
      method: "GET",
      path: stripDomain(url),
      file,
      description: `Frontend fetch call`,
      authenticated: false,
      middleware: [],
    });
  }

  return routes;
}

function extractAxiosCalls(content: string, file: string): RawRoute[] {
  const routes: RawRoute[] = [];
  let m: RegExpExecArray | null;

  AXIOS_RE.lastIndex = 0;
  while ((m = AXIOS_RE.exec(content)) !== null) {
    const method = m[1].toUpperCase() as HttpMethod;
    const url = m[2];
    if (!url.startsWith("/") && !url.startsWith("http")) continue;
    if (shouldSkipPath(url)) continue;

    routes.push({
      method,
      path: stripDomain(url),
      file,
      description: `Frontend axios call`,
      authenticated: false,
      middleware: [],
    });
  }

  return routes;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Paths that are almost certainly not real API routes */
function shouldSkipPath(p: string): boolean {
  if (p.length > 200) return true;
  if (p.includes(" ") && !p.includes("${")) return true;
  if (p.startsWith("#")) return true;
  // Skip test/fixture paths
  if (p.includes("example") && p.includes(".com")) return true;
  return false;
}

/** Strip http(s)://domain from a URL, leaving only the path */
function stripDomain(url: string): string {
  try {
    if (url.startsWith("http")) {
      const u = new URL(url);
      return u.pathname || url;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return url;
}

/** Convert Express-style /:param to /{param} for consistency */
function normalizeExpressPath(p: string): string {
  return p.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
}

/** Check if the surrounding context has an auth middleware hint */
function hasAuthGuard(content: string, index: number): boolean {
  const snippet = content.slice(Math.max(0, index - 200), index + 200);
  return (
    /auth|authenticate|requireAuth|isAuthenticated|verifyToken|jwtAuth|bearer/i.test(snippet)
  );
}

function buildDescription(method: string, routePath: string): string {
  const last = routePath.split("/").filter(Boolean).pop() ?? "resource";
  const resourceName = last.replace(/{[^}]+}/g, "").replace(/[_-]/g, " ").trim() || "item";

  switch (method) {
    case "GET":    return `Get ${resourceName}`;
    case "POST":   return `Create ${resourceName}`;
    case "PUT":    return `Replace ${resourceName}`;
    case "PATCH":  return `Update ${resourceName}`;
    case "DELETE": return `Delete ${resourceName}`;
    default:       return `${method} ${routePath}`;
  }
}
