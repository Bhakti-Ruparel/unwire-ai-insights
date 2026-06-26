/**
 * razorpayService.ts
 *
 * Razorpay subscription & payment integration.
 * Handles checkout, verification, webhooks, and subscription lifecycle.
 *
 * Flow:
 *   1. User selects plan → createSubscription()
 *   2. Frontend opens Razorpay checkout
 *   3. Payment completes → verifyPayment() 
 *   4. Webhook confirms → handleWebhook()
 *   5. Organization plan updated
 *
 * Security:
 *   - All webhooks verified via HMAC-SHA256 signature
 *   - Payment verification uses razorpay_signature
 *   - Never trust frontend success — always verify server-side
 */

import crypto from "crypto";
import { prisma } from "../database/db";
import { recordAudit } from "./auditService";
import { logger } from "../services/logger";
import type { PlanTier } from "./planConfig";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

// ─── Plan pricing (INR paise) ─────────────────────────────────────────────

export const PLAN_PRICING: Record<string, { amount: number; currency: string; name: string; interval: string }> = {
  pro: { amount: 199900, currency: "INR", name: "Unwire AI Pro", interval: "monthly" },          // ₹1,999/month
  enterprise: { amount: 999900, currency: "INR", name: "Unwire AI Enterprise", interval: "monthly" }, // ₹9,999/month
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateSubscriptionResult {
  subscriptionId: string;
  orderId?: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  planName: string;
}

export interface PaymentVerification {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}

// ─── Razorpay API helpers ─────────────────────────────────────────────────

async function razorpayRequest(method: string, path: string, body?: any): Promise<any> {
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const res = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error((data as any)?.error?.description ?? `Razorpay API error: ${res.status}`);
  }
  return data;
}

// ─── Create Subscription/Order ────────────────────────────────────────────

/**
 * Creates a Razorpay order for plan upgrade.
 * Returns order details needed for frontend checkout.
 */
export async function createSubscriptionOrder(
  organizationId: string,
  userId: string,
  plan: PlanTier
): Promise<CreateSubscriptionResult> {
  if (plan === "free") throw new Error("Cannot create order for free plan.");

  const pricing = PLAN_PRICING[plan];
  if (!pricing) throw new Error(`Unknown plan: ${plan}`);

  // Get org details for receipt
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true },
  });
  if (!org) throw new Error("Organization not found.");

  // Create Razorpay order
  const order = await razorpayRequest("POST", "/orders", {
    amount: pricing.amount,
    currency: pricing.currency,
    receipt: `unwire_${org.slug}_${Date.now()}`,
    notes: {
      organizationId,
      userId,
      plan,
      organizationName: org.name,
    },
  });

  // Record in subscription metadata
  await prisma.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      plan: "free", // Stay on free until payment verified
      status: "pending",
      metadata: { pendingOrderId: order.id, pendingPlan: plan } as any,
    },
    update: {
      metadata: { pendingOrderId: order.id, pendingPlan: plan } as any,
    },
  });

  recordAudit({
    organizationId,
    userId,
    action: "billing.order_created",
    metadata: { orderId: order.id, plan, amount: pricing.amount },
  });

  return {
    subscriptionId: order.id,
    orderId: order.id,
    razorpayKeyId: RAZORPAY_KEY_ID,
    amount: pricing.amount,
    currency: pricing.currency,
    planName: pricing.name,
  };
}

// ─── Verify Payment ───────────────────────────────────────────────────────

/**
 * Verify payment signature after checkout completion.
 * Called from frontend after Razorpay checkout success callback.
 */
export async function verifyPayment(
  organizationId: string,
  userId: string,
  verification: PaymentVerification
): Promise<{ success: boolean; plan?: string; error?: string }> {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = verification;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return { success: false, error: "Missing payment verification fields." };
  }

  // Verify signature: HMAC-SHA256(order_id|payment_id, key_secret)
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    logger.warn(`[razorpay] Signature mismatch for order ${razorpay_order_id}`);
    return { success: false, error: "Payment verification failed." };
  }

  // Get subscription to find pending plan
  const sub = await prisma.subscription.findUnique({ where: { organizationId } });
  const metadata = (sub?.metadata ?? {}) as any;
  const pendingPlan = metadata.pendingPlan as PlanTier;

  if (!pendingPlan || pendingPlan === "free") {
    return { success: false, error: "No pending plan upgrade found." };
  }

  // Activate the subscription
  await prisma.subscription.update({
    where: { organizationId },
    data: {
      plan: pendingPlan,
      status: "active",
      startDate: new Date(),
      metadata: {
        ...metadata,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        pendingOrderId: undefined,
        pendingPlan: undefined,
        lastPaymentAt: new Date().toISOString(),
      } as any,
    },
  });

  // Update organization plan
  await prisma.organization.update({
    where: { id: organizationId },
    data: { plan: pendingPlan },
  });

  recordAudit({
    organizationId,
    userId,
    action: "billing.payment_verified",
    metadata: { plan: pendingPlan, paymentId: razorpay_payment_id },
  });

  logger.info(`[razorpay] Payment verified: org=${organizationId}, plan=${pendingPlan}`);
  return { success: true, plan: pendingPlan };
}

// ─── Webhook Handler ──────────────────────────────────────────────────────

/**
 * Handle Razorpay webhook events.
 * Verifies signature and processes payment events.
 */
export async function handleWebhook(
  rawBody: string,
  signature: string
): Promise<{ handled: boolean; event?: string }> {
  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn("[razorpay] Webhook signature verification failed");
    return { handled: false };
  }

  const payload = JSON.parse(rawBody);
  const event = payload.event as string;
  const entity = payload.payload?.payment?.entity ?? payload.payload?.subscription?.entity;

  logger.info(`[razorpay] Webhook: ${event}`);

  switch (event) {
    case "payment.captured":
      await handlePaymentCaptured(entity);
      break;
    case "payment.failed":
      await handlePaymentFailed(entity);
      break;
    case "subscription.cancelled":
      await handleSubscriptionCancelled(entity);
      break;
    case "subscription.paused":
      await handleSubscriptionPaused(entity);
      break;
    default:
      logger.info(`[razorpay] Unhandled webhook event: ${event}`);
  }

  return { handled: true, event };
}

async function handlePaymentCaptured(payment: any): Promise<void> {
  const orderId = payment?.order_id;
  if (!orderId) return;

  // Find subscription with this order
  const sub = await prisma.subscription.findFirst({
    where: { metadata: { path: ["pendingOrderId"], equals: orderId } },
  });

  if (sub) {
    const metadata = (sub.metadata ?? {}) as any;
    const plan = metadata.pendingPlan ?? "pro";

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan,
        status: "active",
        startDate: new Date(),
        metadata: {
          ...metadata,
          razorpayPaymentId: payment.id,
          lastPaymentAt: new Date().toISOString(),
          pendingOrderId: undefined,
          pendingPlan: undefined,
        } as any,
      },
    });

    await prisma.organization.update({
      where: { id: sub.organizationId },
      data: { plan },
    });
  }
}

async function handlePaymentFailed(payment: any): Promise<void> {
  const orderId = payment?.order_id;
  if (!orderId) return;

  const sub = await prisma.subscription.findFirst({
    where: { metadata: { path: ["pendingOrderId"], equals: orderId } },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "payment_failed",
        metadata: { ...(sub.metadata as any), lastError: payment?.error_description ?? "Payment failed" } as any,
      },
    });
  }
}

async function handleSubscriptionCancelled(subscription: any): Promise<void> {
  const subId = subscription?.id;
  if (!subId) return;

  const sub = await prisma.subscription.findFirst({
    where: { metadata: { path: ["razorpaySubscriptionId"], equals: subId } },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: "free", status: "cancelled", endDate: new Date() },
    });
    await prisma.organization.update({
      where: { id: sub.organizationId },
      data: { plan: "free" },
    });
  }
}

async function handleSubscriptionPaused(subscription: any): Promise<void> {
  // Same as cancelled for now
  await handleSubscriptionCancelled(subscription);
}

// ─── Cancel Subscription ──────────────────────────────────────────────────

export async function cancelSubscription(
  organizationId: string,
  userId: string
): Promise<void> {
  await prisma.subscription.update({
    where: { organizationId },
    data: { plan: "free", status: "cancelled", endDate: new Date() },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { plan: "free" },
  });

  recordAudit({
    organizationId,
    userId,
    action: "billing.subscription_cancelled",
  });
}

// ─── Get Subscription Status ──────────────────────────────────────────────

export async function getSubscriptionStatus(organizationId: string) {
  const sub = await prisma.subscription.findUnique({ where: { organizationId } });
  if (!sub) return { plan: "free", status: "active", razorpayKeyId: RAZORPAY_KEY_ID };

  return {
    plan: sub.plan,
    status: sub.status,
    startDate: sub.startDate?.toISOString(),
    endDate: sub.endDate?.toISOString(),
    razorpayKeyId: RAZORPAY_KEY_ID,
    metadata: sub.metadata,
  };
}

// ─── Webhook Signature Verification ───────────────────────────────────────

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
