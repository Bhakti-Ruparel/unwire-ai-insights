/**
 * agentMemory.ts
 *
 * Manages conversation memory for the AI DevOps Agent.
 * Provides:
 *  - Session creation/retrieval
 *  - Message persistence
 *  - Context window management (sliding window)
 *  - Pending approval tracking
 *
 * Sessions are stored in-memory with a TTL and backed by PostgreSQL
 * for persistence across restarts.
 */

import { prisma } from "../../database/db";
import type {
  AgentSession,
  AgentMemoryEntry,
  PendingApproval,
  SessionContext,
} from "./agentTypes";

// ─── In-memory session cache (TTL: 30 minutes) ───────────────────────────

const sessionCache = new Map<string, AgentSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_MEMORY_MESSAGES = 20;  // sliding window

// ─── Session management ───────────────────────────────────────────────────

/**
 * getOrCreateSession
 *
 * Retrieves an existing session from cache/DB or creates a new one.
 */
export async function getOrCreateSession(
  sessionId: string | undefined,
  userId: string
): Promise<AgentSession> {
  // Try cache first
  if (sessionId && sessionCache.has(sessionId)) {
    const session = sessionCache.get(sessionId)!;
    session.lastActiveAt = new Date().toISOString();
    return session;
  }

  // Try database
  if (sessionId) {
    const dbSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: MAX_MEMORY_MESSAGES } },
    });

    if (dbSession) {
      const session: AgentSession = {
        id: dbSession.id,
        userId,
        messages: dbSession.messages.reverse().map((m) => ({
          role: m.role as AgentMemoryEntry["role"],
          content: m.content,
          timestamp: m.createdAt.toISOString(),
        })),
        context: {},
        createdAt: dbSession.createdAt.toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      sessionCache.set(session.id, session);
      return session;
    }
  }

  // Create new session — use a special "agent" projectId placeholder
  // We'll store it in chat_sessions with a nullable projectId approach
  const dbSession = await prisma.chatSession.create({
    data: {
      projectId: getAgentProjectId(userId),
    },
  });

  const session: AgentSession = {
    id: dbSession.id,
    userId,
    messages: [],
    context: {},
    createdAt: dbSession.createdAt.toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  sessionCache.set(session.id, session);
  return session;
}

/**
 * addMessage
 *
 * Adds a message to the session memory and persists to DB.
 */
export async function addMessage(
  session: AgentSession,
  entry: AgentMemoryEntry
): Promise<void> {
  session.messages.push(entry);
  session.lastActiveAt = new Date().toISOString();

  // Sliding window: keep only last N messages in memory
  if (session.messages.length > MAX_MEMORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MEMORY_MESSAGES);
  }

  // Persist to DB (non-blocking)
  prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: entry.role,
      content: entry.content,
    },
  }).catch((err) => {
    console.warn("[agentMemory] Failed to persist message:", err.message);
  });
}

// ─── Context management ───────────────────────────────────────────────────

/**
 * updateContext
 *
 * Updates session context (recent servers/projects, pending approvals).
 */
export function updateContext(
  session: AgentSession,
  updates: Partial<SessionContext>
): void {
  session.context = { ...session.context, ...updates };
}

/**
 * setPendingApproval
 *
 * Sets a pending approval on the session (expires after 5 minutes).
 */
export function setPendingApproval(
  session: AgentSession,
  planId: string,
  action: string,
  description: string,
  steps: string[]
): void {
  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);

  session.context.pendingApproval = {
    planId,
    action,
    description,
    steps,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

/**
 * getPendingApproval
 *
 * Returns the pending approval if still valid (not expired).
 */
export function getPendingApproval(session: AgentSession): PendingApproval | null {
  const pending = session.context.pendingApproval;
  if (!pending) return null;

  // Check expiry
  if (new Date(pending.expiresAt) < new Date()) {
    session.context.pendingApproval = undefined;
    return null;
  }

  return pending;
}

/**
 * clearPendingApproval
 *
 * Clears the pending approval from the session.
 */
export function clearPendingApproval(session: AgentSession): void {
  session.context.pendingApproval = undefined;
}

// ─── Conversation history for LLM ────────────────────────────────────────

/**
 * getConversationHistory
 *
 * Returns conversation messages formatted for LLM context.
 * Returns up to last 10 messages for context window management.
 */
export function getConversationHistory(
  session: AgentSession
): Array<{ role: string; content: string }> {
  return session.messages
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
}

// ─── Cache cleanup (periodic) ─────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessionCache) {
    if (now - new Date(session.lastActiveAt).getTime() > SESSION_TTL_MS) {
      sessionCache.delete(id);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

// ─── Helper: get or create a placeholder "agent" project for session storage

/**
 * Uses a per-user pseudo-project ID for storing agent sessions.
 * This avoids altering the schema while reusing ChatSession/ChatMessage tables.
 */
function getAgentProjectId(userId: string): string {
  // Use a deterministic ID derived from userId so we can reuse it
  // Format: "agent-<first 8 chars of userId>"
  return `agent-${userId.slice(0, 8)}`;
}

/**
 * ensureAgentProject
 *
 * Creates the placeholder project record if it doesn't exist.
 * Called once on first agent session per user.
 */
export async function ensureAgentProject(userId: string): Promise<void> {
  const projectId = getAgentProjectId(userId);
  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing) {
    await prisma.project.create({
      data: {
        id: projectId,
        name: "AI Agent Sessions",
        description: "Internal project for AI agent chat sessions",
        sourceType: "internal",
        status: "Complete",
        analysisStatus: "complete",
        userId,
      },
    }).catch(() => {
      // Race condition: another request already created it
    });
  }
}
