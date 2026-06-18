/**
 * chatService.ts
 *
 * Responsibilities:
 *  1. callLLM(projectId, question, context)
 *     Sends system prompt + retrieved code context + user question to GPT.
 *
 *  2. buildStructuredContext(projectId, question)
 *     No-LLM fallback: builds an answer purely from PostgreSQL data
 *     (APIs, dependencies, schema, backend info). Used when:
 *       - OPENAI_API_KEY is missing
 *       - Chroma is unreachable
 *       - Embeddings not yet generated
 *
 *  3. handleProjectChat(projectId, message, sessionId?)
 *     Main entry point from the HTTP controller:
 *       - Creates / resumes a ChatSession in PostgreSQL
 *       - Calls askProject (RAG or structured fallback)
 *       - Persists user + assistant messages
 *       - Returns { answer, sources, sessionId }
 */

import OpenAI from "openai";
import { prisma } from "../database/db";
import { isEmbeddingAvailable } from "./embeddings";
import { askProject } from "./ragService";

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Unwire AI, a codebase intelligence assistant.

You understand ONLY the user's uploaded project based on the source code and analysis data provided.

Rules:
- Use ONLY the provided code context and analysis data to answer.
- If the information is not available in the context, say so clearly.
- Always cite specific files when mentioning code.
- Be concise but thorough. Use bullet points and code blocks where helpful.
- Never make up API routes, function names, or file paths.
- When asked to list APIs, list them with method and path (e.g. GET /users).
- When asked about authentication, explain the actual implementation found in the code.
- Do not reference external documentation or generic examples.`;

// ─── LLM caller ────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

/**
 * callLLM
 *
 * Sends the question + retrieved code context to GPT-4o-mini.
 * Context is the raw code chunks retrieved from ChromaDB.
 */
export async function callLLM(
  projectId: string,
  question: string,
  codeContext: string
): Promise<string> {
  const openai = getOpenAI();

  const userMessage = `Project context (source code excerpts):

${codeContext}

---

Question: ${question}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system",  content: SYSTEM_PROMPT },
      { role: "user",    content: userMessage   },
    ],
    max_tokens:   1024,
    temperature:  0.2,       // low temperature for factual code answers
  });

  return completion.choices[0]?.message?.content?.trim() ?? "I could not generate an answer.";
}

// ─── Structured context fallback ───────────────────────────────────────────

/**
 * buildStructuredContext
 *
 * Builds an answer purely from PostgreSQL analysis data.
 * No OpenAI required. Pattern-matches the question to known data types.
 */
export async function buildStructuredContext(
  projectId: string,
  question: string
): Promise<string> {
  const lq = question.toLowerCase();

  // Fetch all relevant data from PostgreSQL in parallel
  const [project, apis, deps, schema, backend, services] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.aPIEndpoint.findMany({ where: { projectId }, orderBy: { method: "asc" } }),
    prisma.dependency.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
    prisma.schemaTable.findMany({ where: { projectId } }),
    prisma.backendInfo.findUnique({ where: { projectId } }),
    prisma.externalService.findMany({ where: { projectId } }),
  ]);

  if (!project) {
    return "I couldn't find this project in the database.";
  }

  const stack = project.stack.join(", ") || "Unknown";

  // ── API questions ────────────────────────────────────────────────────────
  if (lq.includes("api") || lq.includes("endpoint") || lq.includes("route") || lq.includes("list all")) {
    if (apis.length === 0) return "No API endpoints were detected in this project.";
    const lines = apis.map(
      (a) => `- **${a.method}** \`${a.path}\`${a.authenticated ? " 🔒" : ""}  ← \`${a.file}\``
    );
    return `This project has **${apis.length} API endpoint${apis.length !== 1 ? "s" : ""}**:\n\n${lines.join("\n")}`;
  }

  // ── Auth / login questions ───────────────────────────────────────────────
  if (lq.includes("auth") || lq.includes("login") || lq.includes("jwt") || lq.includes("password")) {
    const authApis = apis.filter(
      (a) => a.authenticated || /auth|login|register|signup|token|session/i.test(a.path)
    );
    const hasBcrypt = deps.some((d) => d.name.includes("bcrypt"));
    const hasJwt    = deps.some((d) => d.name.includes("jwt") || d.name.includes("jsonwebtoken"));
    const hasPassport = deps.some((d) => d.name.includes("passport"));

    let answer = `**Authentication in ${project.name}:**\n\n`;
    answer += `Stack: ${stack}\n\n`;

    if (authApis.length > 0) {
      answer += `**Auth-related endpoints:**\n`;
      answer += authApis
        .map((a) => `- \`${a.method} ${a.path}\` ← \`${a.file}\``)
        .join("\n") + "\n\n";
    }

    const libs: string[] = [];
    if (hasJwt)      libs.push("JWT (jsonwebtoken)");
    if (hasBcrypt)   libs.push("bcrypt for password hashing");
    if (hasPassport) libs.push("Passport.js");

    if (libs.length > 0) {
      answer += `**Auth libraries detected:** ${libs.join(", ")}\n\n`;
    }

    if (backend?.requestFlow) {
      answer += `**Request flow:** \`${backend.requestFlow}\``;
    }

    return answer;
  }

  // ── Database / schema questions ──────────────────────────────────────────
  if (lq.includes("database") || lq.includes("schema") || lq.includes("table") || lq.includes("collection") || lq.includes("model")) {
    const DB_NAMES = ["MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis"];
    const db = project.stack.find((s) => DB_NAMES.includes(s)) ?? "Unknown";

    if (schema.length === 0) {
      return `Database detected: **${db}**\n\nNo schema tables/models were extracted from this project.`;
    }

    const lines = schema.map(
      (t) => `**${t.tableName}**\n${t.fields.map((f) => `  - \`${f}\``).join("\n")}`
    );
    return `Database: **${db}**\n\n**Schema (${schema.length} table${schema.length !== 1 ? "s" : ""}):**\n\n${lines.join("\n\n")}`;
  }

  // ── Dependencies / packages ──────────────────────────────────────────────
  if (lq.includes("depend") || lq.includes("package") || lq.includes("library") || lq.includes("npm") || lq.includes("install")) {
    if (deps.length === 0) return "No dependencies were detected in this project.";
    const runtime = deps.filter((d) => d.type === "runtime");
    const dev     = deps.filter((d) => d.type === "dev");
    let answer = `This project has **${deps.length} dependencies**:\n\n`;
    if (runtime.length > 0) {
      answer += `**Runtime (${runtime.length}):** ${runtime.slice(0, 15).map((d) => `\`${d.name}@${d.version}\``).join(", ")}`;
      if (runtime.length > 15) answer += ` …and ${runtime.length - 15} more`;
      answer += "\n\n";
    }
    if (dev.length > 0) {
      answer += `**Dev (${dev.length}):** ${dev.slice(0, 10).map((d) => `\`${d.name}\``).join(", ")}`;
      if (dev.length > 10) answer += ` …and ${dev.length - 10} more`;
    }
    return answer;
  }

  // ── External services ────────────────────────────────────────────────────
  if (lq.includes("service") || lq.includes("stripe") || lq.includes("openai") || lq.includes("twilio") || lq.includes("sendgrid")) {
    if (services.length === 0) return "No external services were detected in this project.";
    const lines = services.map((s) => `- **${s.name}** (${s.type})`);
    return `**External services detected (${services.length}):**\n\n${lines.join("\n")}`;
  }

  // ── Deployment / infrastructure questions ─────────────────────────────────
  if (
    lq.includes("deploy") || lq.includes("docker") || lq.includes("kubernetes") ||
    lq.includes("nginx") || lq.includes("ci/cd") || lq.includes("pipeline") ||
    lq.includes("production") || lq.includes("infrastructure") || lq.includes("devops")
  ) {
    const deployment = await prisma.deploymentAnalysis.findUnique({
      where: { projectId },
      include: { issues: true, recommendations: true },
    }).catch(() => null);

    if (!deployment || deployment.status !== "complete") {
      return `Deployment analysis is not yet available for **${project.name}**. ` +
        `Navigate to the Deployment tab to trigger an analysis.`;
    }

    const detectedFiles = (deployment.filesDetected as Array<{ name: string; category: string }>) ?? [];
    const criticals  = deployment.issues.filter((i) => i.severity === "CRITICAL");
    const warnings   = deployment.issues.filter((i) => i.severity === "WARNING");

    let answer = `**Deployment readiness for ${project.name}** — Score: **${deployment.score}/100**\n\n`;

    if (detectedFiles.length > 0) {
      answer += `**Detected deployment files:**\n`;
      answer += detectedFiles.map((f) => `- ${f.name}`).join("\n") + "\n\n";
    } else {
      answer += `⚠️ No deployment configuration files found.\n\n`;
    }

    if (criticals.length > 0) {
      answer += `**Critical issues (${criticals.length}):**\n`;
      answer += criticals.map((i) => `- 🔴 ${i.message}`).join("\n") + "\n\n";
    }

    if (warnings.length > 0) {
      answer += `**Warnings (${warnings.length}):**\n`;
      answer += warnings.map((i) => `- ⚠️ ${i.message}`).join("\n") + "\n\n";
    }

    if (deployment.recommendations.length > 0) {
      answer += `**Top recommendations:**\n`;
      answer += deployment.recommendations.slice(0, 3).map((r) => `- **${r.title}**: ${r.description.slice(0, 100)}…`).join("\n");
    }

    return answer;
  }

  // ── Framework / stack ────────────────────────────────────────────────────
  if (lq.includes("framework") || lq.includes("stack") || lq.includes("technolog") || lq.includes("built with")) {
    let answer = `**${project.name}** is built with:\n\n- Stack: ${stack}\n`;
    if (backend?.framework) answer += `- Backend framework: ${backend.framework}\n`;
    if (backend?.requestFlow) answer += `- Request flow: \`${backend.requestFlow}\`\n`;
    answer += `\n**Stats:**\n- Files: ${project.description.match(/(\d+) files/)?.[1] ?? "?"}`;
    return answer;
  }

  // ── Generic fallback ─────────────────────────────────────────────────────
  return `**${project.name}** (${stack})\n\n` +
    `I found the following analysis data for this project:\n` +
    `- **${apis.length}** API endpoints\n` +
    `- **${deps.length}** dependencies\n` +
    `- **${schema.length}** schema tables\n` +
    `- **${services.length}** external services\n\n` +
    `Try asking more specific questions like:\n` +
    `- "List all APIs"\n` +
    `- "How does authentication work?"\n` +
    `- "Can I deploy this project?"\n` +
    `- "What database is used?"\n` +
    `- "What dependencies are installed?"`;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export interface ChatResult {
  answer: string;
  sources: string[];
  sessionId: string;
}

/**
 * handleProjectChat
 *
 * Called by the HTTP controller. Handles session management,
 * calls the RAG pipeline, persists messages.
 */
export async function handleProjectChat(
  projectId: string,
  message: string,
  sessionId?: string
): Promise<ChatResult> {

  // ── 1. Ensure project exists ─────────────────────────────────────────────
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found.");

  // ── 2. Get or create chat session ────────────────────────────────────────
  let session = sessionId
    ? await prisma.chatSession.findUnique({ where: { id: sessionId } })
    : null;

  if (!session) {
    session = await prisma.chatSession.create({
      data: { projectId },
    });
  }

  // ── 3. Persist user message ───────────────────────────────────────────────
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: message },
  });

  // ── 4. Call RAG pipeline ─────────────────────────────────────────────────
  const { answer, sources } = await askProject(projectId, message);

  // ── 5. Persist assistant message ──────────────────────────────────────────
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "assistant", content: answer },
  });

  return {
    answer,
    sources: sources.map((s) =>
      typeof s === "string" ? s : `${s.file} (lines ${s.lines})`
    ),
    sessionId: session.id,
  };
}
