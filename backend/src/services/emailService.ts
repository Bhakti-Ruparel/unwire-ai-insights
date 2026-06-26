/**
 * emailService.ts
 *
 * Production email service with provider abstraction.
 * Supports: Resend, AWS SES (via nodemailer), SMTP.
 * Configured via environment variables.
 *
 * All email sending is non-blocking (fire-and-forget with logging).
 */

import nodemailer from "nodemailer";
import { logger } from "./logger";

// ─── Configuration ────────────────────────────────────────────────────────

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? "smtp"; // "resend" | "ses" | "smtp"
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Unwire AI <noreply@unwire.ai>";
const SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ─── Transporter ──────────────────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  if (EMAIL_PROVIDER === "ses") {
    _transporter = nodemailer.createTransport({
      host: "email-smtp.us-east-1.amazonaws.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } else {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: false },
    });
  }

  return _transporter;
}

// ─── Send via Resend API ──────────────────────────────────────────────────

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    return res.ok;
  } catch (err) {
    logger.error(`[email:resend] Failed: ${err}`);
    return false;
  }
}

// ─── Core send function ───────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (EMAIL_PROVIDER === "resend" && RESEND_API_KEY) {
      return await sendViaResend(to, subject, html);
    }

    const transporter = getTransporter();
    await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
    return true;
  } catch (err) {
    logger.warn(`[email] Send failed to ${to}: ${err}`);
    return false;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────

export async function sendInvitationEmail(opts: {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
}): Promise<{ sent: boolean; method: string; error?: string }> {
  const { to, orgName, inviterName, token } = opts;
  const link = `${FRONTEND_URL}/invite/${token}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e;">You're invited to ${orgName}</h2>
      <p style="color: #555; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Unwire AI.
      </p>
      <a href="${link}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
        Accept Invitation
      </a>
      <p style="color: #888; font-size: 13px;">
        This invitation expires in 7 days. If you didn't expect this, ignore this email.
      </p>
    </div>`;
  const sent = await sendEmail(to, `Join ${orgName} on Unwire AI`, html);
  return { sent, method: EMAIL_PROVIDER, error: sent ? undefined : "Delivery failed" };
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const link = `${FRONTEND_URL}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e;">Reset your password</h2>
      <p style="color: #555; line-height: 1.6;">
        You requested a password reset. Click the button below to set a new password.
      </p>
      <a href="${link}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
        Reset Password
      </a>
      <p style="color: #888; font-size: 13px;">
        This link expires in 1 hour. If you didn't request this, ignore this email.
      </p>
    </div>`;
  return sendEmail(email, "Reset your Unwire AI password", html);
}

export async function sendDeploymentSuccessEmail(
  email: string,
  projectName: string,
  serverName: string,
  version: number
): Promise<boolean> {
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #22c55e;">✓ Deployment Successful</h2>
      <p style="color: #555; line-height: 1.6;">
        <strong>${projectName}</strong> v${version} has been deployed to <strong>${serverName}</strong>.
      </p>
      <a href="${FRONTEND_URL}/deployments" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
        View Deployment
      </a>
    </div>`;
  return sendEmail(email, `✓ ${projectName} v${version} deployed`, html);
}

export async function sendDeploymentFailureEmail(
  email: string,
  projectName: string,
  serverName: string,
  version: number,
  error: string
): Promise<boolean> {
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #ef4444;">✗ Deployment Failed</h2>
      <p style="color: #555; line-height: 1.6;">
        <strong>${projectName}</strong> v${version} failed to deploy to <strong>${serverName}</strong>.
      </p>
      <p style="background: #fef2f2; padding: 12px; border-radius: 6px; color: #991b1b; font-size: 13px;">
        ${error.slice(0, 200)}
      </p>
      <a href="${FRONTEND_URL}/deployments" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
        View Logs
      </a>
    </div>`;
  return sendEmail(email, `✗ ${projectName} v${version} deployment failed`, html);
}

export async function sendAlertEmail(
  email: string,
  title: string,
  message: string,
  severity: string
): Promise<boolean> {
  const color = severity === "CRITICAL" ? "#ef4444" : "#f59e0b";
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
      <h2 style="color: ${color};">⚠ ${title}</h2>
      <p style="color: #555; line-height: 1.6;">${message}</p>
      <a href="${FRONTEND_URL}/alerts" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
        View Alerts
      </a>
    </div>`;
  return sendEmail(email, `[${severity}] ${title}`, html);
}
