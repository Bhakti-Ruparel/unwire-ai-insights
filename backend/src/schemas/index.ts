/**
 * schemas/index.ts
 *
 * Zod validation schemas for all API endpoints.
 * Centralized schema definitions for request validation.
 */

import { z } from "zod";

// ─── Auth Schemas ─────────────────────────────────────────────────────────

export const signupSchema = {
  body: z.object({
    email: z.string().email("Valid email required.").max(255),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128),
    name: z.string().min(1, "Name is required.").max(100),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email("Valid email required."),
    password: z.string().min(1, "Password is required."),
  }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: z.string().email("Valid email required."),
  }),
};

export const resetPasswordSchema = {
  body: z.object({
    token: z.string().min(1, "Token is required."),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  }),
};

// ─── Server Schemas ───────────────────────────────────────────────────────

export const createServerSchema = {
  body: z.object({
    name: z.string().min(1, "Server name is required.").max(100),
    host: z.string().min(1, "Host/IP is required.").max(255),
    provider: z.string().max(50).optional().default("custom"),
    region: z.string().max(50).optional().default(""),
    sshUser: z.string().max(50).optional().default("root"),
    sshPort: z.number().int().min(1).max(65535).optional().default(22),
  }),
};

// ─── Deployment Schemas ───────────────────────────────────────────────────

export const createDeploymentSchema = {
  body: z.object({
    projectId: z.string().uuid("Valid project ID required."),
    serverId: z.string().uuid("Valid server ID required."),
    branch: z.string().max(100).optional().default("main"),
    environment: z.string().max(50).optional().default("production"),
  }),
};

// ─── Organization Schemas ─────────────────────────────────────────────────

export const createOrgSchema = {
  body: z.object({
    name: z.string().min(1, "Organization name required.").max(100),
  }),
};

export const inviteMemberSchema = {
  body: z.object({
    email: z.string().email("Valid email required."),
    role: z.enum(["ADMIN", "MEMBER", "DEVELOPER"]).optional().default("MEMBER"),
  }),
};

export const updateMemberRoleSchema = {
  body: z.object({
    role: z.enum(["ADMIN", "MEMBER", "DEVELOPER"]),
  }),
};

// ─── Billing Schemas ──────────────────────────────────────────────────────

export const checkoutSchema = {
  body: z.object({
    plan: z.enum(["pro", "enterprise"]),
  }),
};

export const verifyPaymentSchema = {
  body: z.object({
    razorpay_payment_id: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }),
};

// ─── Infrastructure Schemas ───────────────────────────────────────────────

export const connectProviderSchema = {
  body: z.object({
    provider: z.string().min(1, "Provider is required."),
    name: z.string().min(1, "Connection name is required.").max(100),
    credentials: z.record(z.string(), z.string()),
  }),
};

export const disconnectProviderSchema = {
  body: z.object({
    connectionId: z.string().uuid("Valid connection ID required."),
  }),
};

// ─── AI Agent Schemas ─────────────────────────────────────────────────────

export const agentChatSchema = {
  body: z.object({
    message: z.string().min(1, "Message is required.").max(5000),
    sessionId: z.string().optional(),
  }),
};

// ─── Domain / SSL Schemas ─────────────────────────────────────────────────

export const addDomainSchema = {
  body: z.object({
    domain: z.string().min(1).max(255),
    type: z.enum(["A", "CNAME", "AAAA"]).optional().default("A"),
    target: z.string().min(1, "Target is required.").max(255),
  }),
};
