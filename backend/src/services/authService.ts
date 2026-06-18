/**
 * authService.ts
 *
 * Handles user registration, login, and JWT token management.
 * Uses bcrypt for password hashing and jsonwebtoken for tokens.
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../database/db";

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET ?? "unwire-ai-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
  };
}

// ─── Registration ──────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  name: string
): Promise<AuthResult> {
  // Check for existing account
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: name.trim(),
    },
  });

  const token = signToken({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

// ─── Login ─────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password.");
  }

  const token = signToken({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

// ─── Token helpers ─────────────────────────────────────────────────────────

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}
