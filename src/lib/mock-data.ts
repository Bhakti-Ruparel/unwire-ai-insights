export type Project = {
  id: string;
  name: string;
  description: string;
  stack: string[];
  status: "Analyzed" | "Analyzing" | "Queued";
  files: number;
  apis: number;
  deps: number;
  lastAnalyzed: string;
  framework: string;
  database: string;
  external: string[];
};

export const projects: Project[] = [
  {
    id: "ai-expense-tracker",
    name: "AI Expense Tracker",
    description: "Personal finance app with AI categorization and receipts OCR.",
    stack: ["React", "Node.js", "MongoDB"],
    status: "Analyzed",
    files: 243,
    apis: 38,
    deps: 12,
    lastAnalyzed: "2 hours ago",
    framework: "React + Node",
    database: "MongoDB",
    external: ["OpenAI", "Stripe", "Firebase"],
  },
  {
    id: "linear-clone",
    name: "Linear Clone",
    description: "Issue tracker with realtime sync and command palette.",
    stack: ["Next.js", "tRPC", "Postgres"],
    status: "Analyzed",
    files: 412,
    apis: 64,
    deps: 21,
    lastAnalyzed: "yesterday",
    framework: "Next.js",
    database: "Postgres",
    external: ["Pusher", "Resend"],
  },
  {
    id: "shopify-bridge",
    name: "Shopify Bridge",
    description: "Sync inventory between Shopify and internal ERP.",
    stack: ["Python", "FastAPI", "Redis"],
    status: "Analyzing",
    files: 128,
    apis: 22,
    deps: 9,
    lastAnalyzed: "running…",
    framework: "FastAPI",
    database: "Postgres",
    external: ["Shopify", "Sentry"],
  },
];

export const apis = [
  { name: "/login", method: "POST", file: "routes/auth.js", usage: 124 },
  { name: "/users", method: "GET", file: "controllers/userController.js", usage: 96 },
  { name: "/users/:id", method: "PATCH", file: "controllers/userController.js", usage: 41 },
  { name: "/expenses", method: "GET", file: "routes/expenses.js", usage: 312 },
  { name: "/expenses", method: "POST", file: "routes/expenses.js", usage: 187 },
  { name: "/expenses/:id", method: "DELETE", file: "routes/expenses.js", usage: 22 },
  { name: "/ai/categorize", method: "POST", file: "services/ai.js", usage: 540 },
  { name: "/billing/checkout", method: "POST", file: "routes/billing.js", usage: 18 },
  { name: "/webhooks/stripe", method: "POST", file: "routes/webhooks.js", usage: 9 },
];

export const dependencies = [
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
];

export const schema = [
  { table: "users", fields: ["id: ObjectId", "email: string", "passwordHash: string", "createdAt: Date"] },
  { table: "expenses", fields: ["id: ObjectId", "userId: ObjectId", "amount: number", "category: string", "createdAt: Date"] },
  { table: "categories", fields: ["id: ObjectId", "name: string", "color: string"] },
  { table: "receipts", fields: ["id: ObjectId", "expenseId: ObjectId", "url: string", "ocrText: string"] },
];

export function getProject(id: string) {
  return projects.find((p) => p.id === id) ?? projects[0];
}
