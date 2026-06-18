/**
 * externalServiceDetector.ts
 *
 * Detects third-party/external services used in a project from:
 *  1. package.json dependencies
 *  2. import statements in source files
 *  3. require() calls
 *
 * Returns a list of ExternalServiceDTO records ready for DB insertion.
 */

import fs from "fs";
import type { ScannedFile } from "./codeScanner";
import type { DependencyDTO } from "../models/Project";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExternalServiceDTO {
  name: string;
  type: string;   // "payment" | "ai" | "cloud" | "email" | "sms" | "auth" | "storage" | "database" | "monitoring" | "other"
  usage: number;
  file: string;
}

// ─── Service Registry ──────────────────────────────────────────────────────

interface ServiceDef {
  name: string;
  type: string;
  packageNames: string[];
  importPatterns?: RegExp[];
}

const SERVICE_REGISTRY: ServiceDef[] = [
  // Payments
  { name: "Stripe", type: "payment", packageNames: ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js"] },
  { name: "PayPal", type: "payment", packageNames: ["@paypal/paypal-js", "paypal-rest-sdk"] },
  { name: "Razorpay", type: "payment", packageNames: ["razorpay"] },
  { name: "Braintree", type: "payment", packageNames: ["braintree"] },

  // AI / ML
  { name: "OpenAI", type: "ai", packageNames: ["openai", "@openai/openai"] },
  { name: "Anthropic", type: "ai", packageNames: ["@anthropic-ai/sdk"] },
  { name: "Google Gemini", type: "ai", packageNames: ["@google/generative-ai"] },
  { name: "Cohere", type: "ai", packageNames: ["cohere-ai"] },
  { name: "Hugging Face", type: "ai", packageNames: ["@huggingface/inference"] },
  { name: "LangChain", type: "ai", packageNames: ["langchain", "@langchain/core", "@langchain/openai"] },

  // Cloud / Infrastructure
  { name: "AWS S3", type: "cloud", packageNames: ["aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb"] },
  { name: "Google Cloud", type: "cloud", packageNames: ["@google-cloud/storage", "@google-cloud/bigquery"] },
  { name: "Azure", type: "cloud", packageNames: ["@azure/storage-blob", "@azure/identity"] },
  { name: "Cloudinary", type: "storage", packageNames: ["cloudinary"] },
  { name: "Uploadthing", type: "storage", packageNames: ["uploadthing", "@uploadthing/react"] },

  // Email
  { name: "SendGrid", type: "email", packageNames: ["@sendgrid/mail", "sendgrid"] },
  { name: "Mailgun", type: "email", packageNames: ["mailgun-js", "mailgun.js"] },
  { name: "Resend", type: "email", packageNames: ["resend"] },
  { name: "Nodemailer", type: "email", packageNames: ["nodemailer"] },
  { name: "Postmark", type: "email", packageNames: ["postmark"] },

  // SMS / Communications
  { name: "Twilio", type: "sms", packageNames: ["twilio"] },
  { name: "Vonage", type: "sms", packageNames: ["@vonage/server-sdk"] },

  // Auth
  { name: "Auth0", type: "auth", packageNames: ["auth0", "@auth0/nextjs-auth0", "@auth0/auth0-react"] },
  { name: "Clerk", type: "auth", packageNames: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/clerk-sdk-node"] },
  { name: "Supabase Auth", type: "auth", packageNames: ["@supabase/supabase-js"] },
  { name: "NextAuth", type: "auth", packageNames: ["next-auth", "@auth/core"] },
  { name: "Passport", type: "auth", packageNames: ["passport", "passport-jwt", "passport-local"] },

  // Database as a Service
  { name: "Firebase", type: "database", packageNames: ["firebase", "firebase-admin"] },
  { name: "Supabase", type: "database", packageNames: ["@supabase/supabase-js"] },
  { name: "PlanetScale", type: "database", packageNames: ["@planetscale/database"] },
  { name: "Neon", type: "database", packageNames: ["@neondatabase/serverless"] },
  { name: "MongoDB Atlas", type: "database", packageNames: ["mongodb", "mongoose"] },

  // Monitoring / Analytics
  { name: "Sentry", type: "monitoring", packageNames: ["@sentry/node", "@sentry/react", "@sentry/nextjs"] },
  { name: "Datadog", type: "monitoring", packageNames: ["dd-trace", "datadog-lambda-js"] },
  { name: "LogRocket", type: "monitoring", packageNames: ["logrocket"] },
  { name: "Mixpanel", type: "monitoring", packageNames: ["mixpanel", "mixpanel-browser"] },
  { name: "Segment", type: "monitoring", packageNames: ["@segment/analytics-node", "@segment/analytics-next"] },

  // Real-time / Messaging
  { name: "Pusher", type: "other", packageNames: ["pusher", "pusher-js"] },
  { name: "Socket.io", type: "other", packageNames: ["socket.io", "socket.io-client"] },
  { name: "Ably", type: "other", packageNames: ["ably"] },

  // Maps
  { name: "Google Maps", type: "other", packageNames: ["@googlemaps/js-api-loader", "google-maps-react"] },
  { name: "Mapbox", type: "other", packageNames: ["mapbox-gl", "react-map-gl"] },
];

// Build a quick lookup: package name → ServiceDef
const PKG_TO_SERVICE = new Map<string, ServiceDef>();
for (const svc of SERVICE_REGISTRY) {
  for (const pkg of svc.packageNames) {
    PKG_TO_SERVICE.set(pkg.toLowerCase(), svc);
  }
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * detectExternalServices
 *
 * Pass in both the dependency list (from dependencyAnalyzer) and all scanned
 * files. Returns a deduplicated list of detected services with usage counts.
 */
export function detectExternalServices(
  dependencies: DependencyDTO[],
  files: ScannedFile[]
): ExternalServiceDTO[] {
  const serviceMap = new Map<string, ExternalServiceDTO>();

  // ── Step 1: Match against dependency list ───────────────────────────────
  for (const dep of dependencies) {
    const def = PKG_TO_SERVICE.get(dep.name.toLowerCase());
    if (!def) continue;
    if (!serviceMap.has(def.name)) {
      serviceMap.set(def.name, {
        name: def.name,
        type: def.type,
        usage: 0,
        file: "package.json",
      });
    }
  }

  // ── Step 2: Count import usage across source files ──────────────────────
  const JS_EXTS = new Set(["js", "ts", "jsx", "tsx", "mjs", "cjs"]);

  for (const file of files) {
    const ext = file.extension.toLowerCase();
    if (!JS_EXTS.has(ext)) continue;
    if (file.size > 300_000) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.absolutePath, "utf-8");
    } catch {
      continue;
    }

    // Match:  import X from "package"  or  require("package")
    const importRe = /(?:import\s+.*?from\s+['"]|require\s*\(\s*['"])(@?[\w/.-]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const imported = m[1].toLowerCase();

      // Check exact match and scoped-package partial match
      const def =
        PKG_TO_SERVICE.get(imported) ??
        PKG_TO_SERVICE.get(imported.split("/").slice(0, 2).join("/")) ??
        PKG_TO_SERVICE.get(imported.split("/")[0]);

      if (!def) continue;

      if (!serviceMap.has(def.name)) {
        serviceMap.set(def.name, {
          name: def.name,
          type: def.type,
          usage: 0,
          file: file.relativePath,
        });
      }
      // Increment usage counter
      const entry = serviceMap.get(def.name)!;
      entry.usage += 1;
    }
  }

  return [...serviceMap.values()];
}
