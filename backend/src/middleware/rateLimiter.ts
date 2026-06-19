/**
 * rateLimiter.ts
 *
 * Express rate limiting for production SaaS.
 * Protects against brute force, DDoS, and API abuse.
 */

import rateLimit from "express-rate-limit";

// ─── Global API limit ─────────────────────────────────────────────────────
// 200 requests per minute per IP
export const globalLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              200,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/health",
});

// ─── Auth endpoint limiter ────────────────────────────────────────────────
// 10 login attempts per 15 minutes per IP — brute force protection
export const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: "Too many auth attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,  // only count failed attempts
});

// ─── Deployment limiter ───────────────────────────────────────────────────
// 20 deployments per hour per IP — prevents abuse
export const deploymentLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: "Deployment limit reached. Try again in an hour." },
});

// ─── Upload limiter ───────────────────────────────────────────────────────
// 10 uploads per hour per IP
export const uploadLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: "Upload limit reached. Try again in an hour." },
});

// ─── Agent push limiter ───────────────────────────────────────────────────
// Agent can push metrics/logs up to 120 times/min
export const agentPushLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              120,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { success: false, error: "Agent push rate limit exceeded." },
});
