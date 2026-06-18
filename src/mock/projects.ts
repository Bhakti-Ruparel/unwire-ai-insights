import type {
  Project,
  APIEndpoint,
  Dependency,
  DatabaseTable,
  ArchitectureNode,
  BackendInfo,
  ProjectOverview,
} from "@/types/project";

// ─── Projects ──────────────────────────────────────────────────────────────

export const MOCK_PROJECTS: Project[] = [
  {
    id: "ai-expense-tracker",
    name: "AI Expense Tracker",
    description: "Personal finance app with AI categorization and receipts OCR.",
    stack: ["React", "Node.js", "MongoDB"],
    status: "Analyzed",
    analysisStatus: "complete",
    filesCount: 243,
    apiCount: 38,
    dependenciesCount: 12,
    createdAt: "2024-11-10T09:00:00Z",
    updatedAt: "2024-11-12T14:30:00Z",
    lastAnalyzed: "2 hours ago",
    framework: "React + Node",
    database: "MongoDB",
    externalServices: ["OpenAI", "Stripe", "Firebase"],
    sourceType: "github",
    githubUrl: "https://github.com/example/ai-expense-tracker",
  },
  {
    id: "linear-clone",
    name: "Linear Clone",
    description: "Issue tracker with realtime sync and command palette.",
    stack: ["Next.js", "tRPC", "Postgres"],
    status: "Analyzed",
    analysisStatus: "complete",
    filesCount: 412,
    apiCount: 64,
    dependenciesCount: 21,
    createdAt: "2024-11-08T11:00:00Z",
    updatedAt: "2024-11-11T16:45:00Z",
    lastAnalyzed: "yesterday",
    framework: "Next.js",
    database: "Postgres",
    externalServices: ["Pusher", "Resend"],
    sourceType: "zip",
  },
  {
    id: "shopify-bridge",
    name: "Shopify Bridge",
    description: "Sync inventory between Shopify and internal ERP.",
    stack: ["Python", "FastAPI", "Redis"],
    status: "Analyzing",
    analysisStatus: "processing",
    filesCount: 128,
    apiCount: 22,
    dependenciesCount: 9,
    createdAt: "2024-11-12T08:00:00Z",
    updatedAt: "2024-11-12T15:00:00Z",
    lastAnalyzed: "running…",
    framework: "FastAPI",
    database: "Postgres",
    externalServices: ["Shopify", "Sentry"],
    sourceType: "github",
    githubUrl: "https://github.com/example/shopify-bridge",
  },
];

// ─── APIs per project ──────────────────────────────────────────────────────

export const MOCK_APIS: Record<string, APIEndpoint[]> = {
  "ai-expense-tracker": [
    { id: "1", method: "POST", path: "/login", file: "routes/auth.js", usage: 124, authenticated: false, description: "Authenticate user and return JWT" },
    { id: "2", method: "GET", path: "/users", file: "controllers/userController.js", usage: 96, authenticated: true, description: "List all users" },
    { id: "3", method: "PATCH", path: "/users/:id", file: "controllers/userController.js", usage: 41, authenticated: true, description: "Update user profile" },
    { id: "4", method: "GET", path: "/expenses", file: "routes/expenses.js", usage: 312, authenticated: true, description: "Get paginated expense list" },
    { id: "5", method: "POST", path: "/expenses", file: "routes/expenses.js", usage: 187, authenticated: true, description: "Create a new expense" },
    { id: "6", method: "DELETE", path: "/expenses/:id", file: "routes/expenses.js", usage: 22, authenticated: true, description: "Delete an expense by ID" },
    { id: "7", method: "POST", path: "/ai/categorize", file: "services/ai.js", usage: 540, authenticated: true, description: "AI-powered expense categorization" },
    { id: "8", method: "POST", path: "/billing/checkout", file: "routes/billing.js", usage: 18, authenticated: true, description: "Create Stripe checkout session" },
    { id: "9", method: "POST", path: "/webhooks/stripe", file: "routes/webhooks.js", usage: 9, authenticated: false, description: "Handle Stripe webhook events" },
  ],
  "linear-clone": [
    { id: "1", method: "GET", path: "/api/issues", file: "pages/api/issues.ts", usage: 841, authenticated: true, description: "List all issues with filters" },
    { id: "2", method: "POST", path: "/api/issues", file: "pages/api/issues.ts", usage: 263, authenticated: true, description: "Create a new issue" },
    { id: "3", method: "PATCH", path: "/api/issues/:id", file: "pages/api/issues/[id].ts", usage: 594, authenticated: true, description: "Update issue status or assignment" },
    { id: "4", method: "DELETE", path: "/api/issues/:id", file: "pages/api/issues/[id].ts", usage: 88, authenticated: true, description: "Archive issue" },
    { id: "5", method: "GET", path: "/api/projects", file: "pages/api/projects.ts", usage: 230, authenticated: true, description: "List workspace projects" },
    { id: "6", method: "POST", path: "/api/comments", file: "pages/api/comments.ts", usage: 176, authenticated: true, description: "Add comment to issue" },
  ],
  "shopify-bridge": [
    { id: "1", method: "GET", path: "/products/sync", file: "routes/products.py", usage: 44, authenticated: true, description: "Trigger product sync from Shopify" },
    { id: "2", method: "POST", path: "/webhooks/shopify", file: "routes/webhooks.py", usage: 312, authenticated: false, description: "Handle Shopify webhook" },
    { id: "3", method: "GET", path: "/inventory", file: "routes/inventory.py", usage: 88, authenticated: true, description: "Get current inventory levels" },
    { id: "4", method: "POST", path: "/orders/fulfill", file: "routes/orders.py", usage: 55, authenticated: true, description: "Fulfill order in ERP" },
  ],
};

// ─── Dependencies per project ──────────────────────────────────────────────

export const MOCK_DEPENDENCIES: Record<string, Dependency[]> = {
  "ai-expense-tracker": [
    { name: "react", version: "19.0.0", type: "runtime" },
    { name: "express", version: "4.19.2", type: "runtime" },
    { name: "mongoose", version: "8.5.1", type: "runtime" },
    { name: "axios", version: "1.7.2", type: "runtime" },
    { name: "openai", version: "4.55.0", type: "runtime" },
    { name: "stripe", version: "16.2.0", type: "runtime" },
    { name: "firebase-admin", version: "12.3.0", type: "runtime" },
    { name: "zod", version: "3.23.8", type: "runtime" },
    { name: "vite", version: "5.4.0", type: "dev" },
    { name: "typescript", version: "5.5.4", type: "dev" },
    { name: "jest", version: "29.7.0", type: "dev" },
    { name: "eslint", version: "9.0.0", type: "dev" },
  ],
  "linear-clone": [
    { name: "next", version: "14.2.5", type: "runtime" },
    { name: "@trpc/server", version: "11.0.0", type: "runtime" },
    { name: "@trpc/client", version: "11.0.0", type: "runtime" },
    { name: "prisma", version: "5.17.0", type: "runtime" },
    { name: "@prisma/client", version: "5.17.0", type: "runtime" },
    { name: "pusher", version: "5.2.0", type: "runtime" },
    { name: "resend", version: "3.4.0", type: "runtime" },
    { name: "zod", version: "3.23.8", type: "runtime" },
    { name: "tailwindcss", version: "3.4.7", type: "dev" },
    { name: "typescript", version: "5.5.4", type: "dev" },
  ],
  "shopify-bridge": [
    { name: "fastapi", version: "0.112.0", type: "runtime" },
    { name: "redis", version: "5.0.8", type: "runtime" },
    { name: "shopify-api", version: "11.4.0", type: "runtime" },
    { name: "celery", version: "5.4.0", type: "runtime" },
    { name: "pydantic", version: "2.8.2", type: "runtime" },
    { name: "sentry-sdk", version: "2.13.0", type: "runtime" },
    { name: "pytest", version: "8.3.2", type: "dev" },
    { name: "black", version: "24.8.0", type: "dev" },
    { name: "ruff", version: "0.6.2", type: "dev" },
  ],
};

// ─── Database Schema per project ───────────────────────────────────────────

export const MOCK_SCHEMA: Record<string, DatabaseTable[]> = {
  "ai-expense-tracker": [
    { table: "users", fields: ["id: ObjectId", "email: string", "passwordHash: string", "createdAt: Date"] },
    { table: "expenses", fields: ["id: ObjectId", "userId: ObjectId", "amount: number", "category: string", "createdAt: Date"] },
    { table: "categories", fields: ["id: ObjectId", "name: string", "color: string"] },
    { table: "receipts", fields: ["id: ObjectId", "expenseId: ObjectId", "url: string", "ocrText: string"] },
  ],
  "linear-clone": [
    { table: "users", fields: ["id: uuid", "email: text UNIQUE", "name: text", "avatarUrl: text", "createdAt: timestamptz"] },
    { table: "projects", fields: ["id: uuid", "name: text", "identifier: text", "createdAt: timestamptz"] },
    { table: "issues", fields: ["id: uuid", "title: text", "status: text", "priority: int", "projectId: uuid FK", "assigneeId: uuid FK"] },
    { table: "comments", fields: ["id: uuid", "body: text", "issueId: uuid FK", "authorId: uuid FK", "createdAt: timestamptz"] },
    { table: "labels", fields: ["id: uuid", "name: text", "color: text", "projectId: uuid FK"] },
  ],
  "shopify-bridge": [
    { table: "products", fields: ["id: bigint", "shopifyId: text UNIQUE", "sku: text", "title: text", "inventory: int"] },
    { table: "sync_jobs", fields: ["id: bigint", "status: text", "startedAt: timestamptz", "finishedAt: timestamptz", "errors: jsonb"] },
    { table: "orders", fields: ["id: bigint", "shopifyOrderId: text", "erpOrderId: text", "status: text", "fulfilledAt: timestamptz"] },
  ],
};

// ─── Architecture Nodes per project ────────────────────────────────────────

export const MOCK_ARCHITECTURE: Record<string, ArchitectureNode[]> = {
  "ai-expense-tracker": [
    { id: "fe", x: 50, y: 8, label: "Frontend", sub: "React • Vite", type: "frontend" },
    { id: "api", x: 50, y: 28, label: "API Layer", sub: "REST • Express", type: "api" },
    { id: "be", x: 50, y: 48, label: "Backend", sub: "Node.js", type: "backend" },
    { id: "db", x: 50, y: 68, label: "Database", sub: "MongoDB", type: "database" },
    { id: "ext", x: 50, y: 88, label: "External APIs", sub: "OpenAI • Stripe", type: "external" },
  ],
  "linear-clone": [
    { id: "fe", x: 50, y: 8, label: "Frontend", sub: "Next.js • React", type: "frontend" },
    { id: "api", x: 50, y: 28, label: "API Layer", sub: "tRPC • REST", type: "api" },
    { id: "be", x: 50, y: 48, label: "Backend", sub: "Next.js API Routes", type: "backend" },
    { id: "db", x: 50, y: 68, label: "Database", sub: "Postgres • Prisma", type: "database" },
    { id: "ext", x: 50, y: 88, label: "External APIs", sub: "Pusher • Resend", type: "external" },
  ],
  "shopify-bridge": [
    { id: "fe", x: 50, y: 8, label: "Admin UI", sub: "React • Vite", type: "frontend" },
    { id: "api", x: 50, y: 28, label: "API Layer", sub: "FastAPI • REST", type: "api" },
    { id: "be", x: 50, y: 48, label: "Backend", sub: "Python • Celery", type: "backend" },
    { id: "db", x: 50, y: 68, label: "Database", sub: "Postgres • Redis", type: "database" },
    { id: "ext", x: 50, y: 88, label: "External APIs", sub: "Shopify • Sentry", type: "external" },
  ],
};

// ─── Backend Info per project ──────────────────────────────────────────────

export const MOCK_BACKEND: Record<string, BackendInfo> = {
  "ai-expense-tracker": {
    projectId: "ai-expense-tracker",
    framework: "Express",
    routesCount: 23,
    controllersCount: 8,
    middleware: ["JWT Auth", "CORS", "Rate-limit"],
    requestFlow: "Client → CORS → RateLimit → JWTAuth → Router → Controller → Service → Model → DB",
  },
  "linear-clone": {
    projectId: "linear-clone",
    framework: "Next.js API Routes + tRPC",
    routesCount: 41,
    controllersCount: 12,
    middleware: ["NextAuth", "CORS", "Zod Validation"],
    requestFlow: "Client → NextAuth → tRPC Router → Resolver → Prisma → Postgres",
  },
  "shopify-bridge": {
    projectId: "shopify-bridge",
    framework: "FastAPI",
    routesCount: 18,
    controllersCount: 5,
    middleware: ["API Key Auth", "CORS", "Rate-limit"],
    requestFlow: "Client → API Key Auth → FastAPI Router → Service → Celery Task → Postgres / Redis",
  },
};

// ─── Overview per project ──────────────────────────────────────────────────

export const MOCK_OVERVIEW: Record<string, ProjectOverview> = {
  "ai-expense-tracker": {
    projectId: "ai-expense-tracker",
    framework: "React + Node",
    filesCount: 243,
    apiCount: 38,
    database: "MongoDB",
    dependenciesCount: 12,
    externalServices: [
      { name: "OpenAI", type: "ai", usage: 5, file: "package.json" },
      { name: "Stripe", type: "payment", usage: 3, file: "package.json" },
      { name: "Firebase", type: "database", usage: 2, file: "package.json" },
    ],
    externalServicesCount: 3,
    architectureNodes: MOCK_ARCHITECTURE["ai-expense-tracker"],
    architectureEdges: [],
  },
  "linear-clone": {
    projectId: "linear-clone",
    framework: "Next.js",
    filesCount: 412,
    apiCount: 64,
    database: "Postgres",
    dependenciesCount: 21,
    externalServices: [
      { name: "Pusher", type: "other", usage: 4, file: "package.json" },
      { name: "Resend", type: "email", usage: 1, file: "package.json" },
    ],
    externalServicesCount: 2,
    architectureNodes: MOCK_ARCHITECTURE["linear-clone"],
    architectureEdges: [],
  },
  "shopify-bridge": {
    projectId: "shopify-bridge",
    framework: "FastAPI",
    filesCount: 128,
    apiCount: 22,
    database: "Postgres",
    dependenciesCount: 9,
    externalServices: [
      { name: "Sentry", type: "monitoring", usage: 2, file: "package.json" },
    ],
    externalServicesCount: 1,
    architectureNodes: MOCK_ARCHITECTURE["shopify-bridge"],
    architectureEdges: [],
  },
};
