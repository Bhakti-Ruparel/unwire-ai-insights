/**
 * passwordResetService.ts
 *
 * Secure password reset flow:
 * 1. User requests reset → generate token → send email
 * 2. User clicks link → verify token
 * 3. User sets new password → consume token → update hash
 *
 * Security:
 * - Token is hashed (SHA-256) before storage
 * - Token expires in 1 hour
 * - One-time use (deleted after consumption)
 * - Rate limited (max 3 requests per hour per email)
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../database/db";
import { sendPasswordResetEmail } from "./emailService";
import { logger } from "./logger";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const SALT_ROUNDS = 12;

// ─── Request password reset ───────────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<{ sent: boolean }> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, isActive: true },
  });

  // Always return success to prevent email enumeration
  if (!user || !user.isActive) {
    return { sent: true }; // Don't reveal if email exists
  }

  // Rate limit: max 3 tokens in last hour
  const recentCount = await prisma.usageRecord.count({
    where: {
      userId: user.id,
      type: "password_reset_request",
      createdAt: { gte: new Date(Date.now() - TOKEN_EXPIRY_MS) },
    },
  });
  if (recentCount >= 3) {
    return { sent: true }; // Silently fail on rate limit
  }

  // Generate token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store hashed token in usage_records (simple approach without new table)
  await prisma.usageRecord.create({
    data: {
      userId: user.id,
      type: "password_reset_request",
      metadata: { hashedToken, expiresAt: expiresAt.toISOString() } as any,
    },
  });

  // Send email with raw token
  await sendPasswordResetEmail(user.email, rawToken);

  logger.info(`[passwordReset] Token generated for ${user.email}`);
  return { sent: true };
}

// ─── Verify token (check validity without consuming) ──────────────────────

export async function verifyResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.usageRecord.findFirst({
    where: {
      type: "password_reset_request",
      metadata: { path: ["hashedToken"], equals: hashedToken },
    },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { valid: false };

  const metadata = record.metadata as any;
  const expiresAt = new Date(metadata.expiresAt);

  if (expiresAt < new Date()) {
    return { valid: false }; // Expired
  }

  return { valid: true, email: record.user.email };
}

// ─── Reset password (consume token + update) ──────────────────────────────

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.usageRecord.findFirst({
    where: {
      type: "password_reset_request",
      metadata: { path: ["hashedToken"], equals: hashedToken },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { success: false, error: "Invalid or expired reset token." };
  }

  const metadata = record.metadata as any;
  const expiresAt = new Date(metadata.expiresAt);

  if (expiresAt < new Date()) {
    return { success: false, error: "Reset token has expired. Request a new one." };
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update user password
  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash },
  });

  // Invalidate ALL existing sessions (security: attacker tokens become invalid)
  await prisma.session.deleteMany({ where: { userId: record.userId } });

  // Delete the used token (one-time use)
  await prisma.usageRecord.delete({ where: { id: record.id } });

  // Also delete any other reset tokens for this user
  await prisma.usageRecord.deleteMany({
    where: { userId: record.userId, type: "password_reset_request" },
  });

  logger.info(`[passwordReset] Password reset completed for user ${record.userId}`);
  return { success: true };
}
