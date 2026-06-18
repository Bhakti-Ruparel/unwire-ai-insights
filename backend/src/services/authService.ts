/**
 * authService.ts
 *
 * Production-grade JWT auth with:
 *  - Short-lived access tokens (15 min)
 *  - Long-lived refresh tokens (30 days) stored in DB
 *  - Role-based access (USER | ADMIN)
 *  - bcrypt password hashing (12 rounds)
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../database/db";

const SALT_ROUNDS    = 12;
const ACCESS_SECRET  = process.env.JWT_SECRET ?? "unwire-ai-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "unwire-ai-refresh-secret";
const ACCESS_TTL     = "15m";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  email:  string;
  role:   string;
}

export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: {
    id:        string;
    email:     string;
    name:      string;
    role:      string;
    createdAt: string;
  };
}

// ─── Token helpers ─────────────────────────────────────────────────────────

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, ACCESS_SECRET) as AuthPayload;
}

async function createRefreshToken(
  userId: string,
  userAgent = "",
  ipAddress = ""
): Promise<string> {
  const token     = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  // Prune old sessions for this user (keep max 5 devices)
  const old = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: 4,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.session.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  }

  await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      refreshToken: token,
      expiresAt,
      userAgent,
      ipAddress,
    },
  });
  return token;
}

// ─── Registration ──────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  name: string,
  userAgent = "",
  ipAddress = ""
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error("An account with this email already exists.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name: name.trim(), role: "USER" },
  });

  // Create a personal organization automatically
  const slug = slugify(name.trim()) + "-" + user.id.slice(0, 8);
  const org  = await prisma.organization.create({
    data: {
      id:      crypto.randomUUID(),
      name:    `${name.trim()}'s Workspace`,
      slug,
      ownerId: user.id,
    },
  });
  await prisma.organizationMember.create({
    data: {
      id:             crypto.randomUUID(),
      organizationId: org.id,
      userId:         user.id,
      role:           "OWNER",
    },
  });

  const tokens = await buildTokens(user.id, user.email, user.role, userAgent, ipAddress);
  return { tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() } };
}

// ─── Login ─────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string,
  userAgent = "",
  ipAddress = ""
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }
  if (!user.isActive) throw new Error("Account is disabled. Contact support.");

  const tokens = await buildTokens(user.id, user.email, user.role, userAgent, ipAddress);
  return { tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() } };
}

// ─── Refresh ───────────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    throw new Error("Refresh token expired or invalid. Please log in again.");
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) throw new Error("User not found or disabled.");

  // Rotate refresh token
  await prisma.session.delete({ where: { id: session.id } });
  return buildTokens(user.id, user.email, user.role, session.userAgent, session.ipAddress);
}

// ─── Logout ────────────────────────────────────────────────────────────────

export async function logoutUser(refreshToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { refreshToken } });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

// ─── Profile ───────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      orgMemberships: {
        include: { organization: { select: { id: true, name: true, slug: true, plan: true } } },
      },
      _count: { select: { projects: true, servers: true } },
    },
  });
  if (!user) return null;

  return {
    id:           user.id,
    email:        user.email,
    name:         user.name,
    role:         user.role,
    isActive:     user.isActive,
    avatarUrl:    user.avatarUrl,
    createdAt:    user.createdAt.toISOString(),
    projectCount: user._count.projects,
    serverCount:  user._count.servers,
    organizations: user.orgMemberships.map((m) => ({
      id:   m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      role: m.role,
    })),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function buildTokens(
  userId: string,
  email: string,
  role: string,
  userAgent: string,
  ipAddress: string
): Promise<AuthTokens> {
  const accessToken  = signAccessToken({ userId, email, role });
  const refreshToken = await createRefreshToken(userId, userAgent, ipAddress);
  return { accessToken, refreshToken };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "workspace";
}

// ─── Usage tracking ────────────────────────────────────────────────────────

export async function trackUsage(
  userId: string,
  type: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await prisma.usageRecord.create({
    data: { id: crypto.randomUUID(), userId, type, metadata: metadata as any },
  });
}
