/**
 * emailService.ts
 *
 * Production-ready email service. Sends via SMTP when configured,
 * falls back to console logging in development.
 *
 * Env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *   FRONTEND_URL (used for building links)
 */

import { createTransport, type Transporter } from "nodemailer";

// ─── Result type ──────────────────────────────────────────────────────────

export interface EmailResult {
  sent: boolean;
  method: "smtp" | "console";
  error?: string;
}

// ─── Transporter setup ────────────────────────────────────────────────────

let _transporter: Transporter | null = null;
let _transporterChecked = false;

function getTransporter(): Transporter | null {
  if (_transporterChecked) return _transporter;
  _transporterChecked = true;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    console.log("[email] SMTP not configured — emails will be logged to console.");
    return null;
  }

  _transporter = createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
  return _transporter;
}

function getFrom(): string {
  return process.env.SMTP_FROM ?? "Unwire AI <noreply@unwire.ai>";
}

function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL?.split(",")[0]?.trim() ?? "http://localhost:5173").replace(/\/$/, "");
}

// ─── Send invitation email ────────────────────────────────────────────────

export async function sendInvitationEmail(opts: {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
}): Promise<EmailResult> {
  const acceptUrl = `${getFrontendUrl()}/invite/${opts.token}`;
  const subject = `You've been invited to join ${opts.orgName} on Unwire AI`;

  const html = buildInvitationHtml({
    orgName: opts.orgName,
    inviterName: opts.inviterName,
    role: opts.role,
    acceptUrl,
  });

  const transporter = getTransporter();

  if (!transporter) {
    // Development fallback — log to console
    console.log("");
    console.log("┌─────────────────────────────────────────────────────────────");
    console.log("│ 📧 INVITATION EMAIL (dev mode — SMTP not configured)");
    console.log("│");
    console.log(`│ To:           ${opts.to}`);
    console.log(`│ Organization: ${opts.orgName}`);
    console.log(`│ Invited by:   ${opts.inviterName}`);
    console.log(`│ Role:         ${opts.role}`);
    console.log("│");
    console.log(`│ 🔗 Accept URL: ${acceptUrl}`);
    console.log("│");
    console.log("└─────────────────────────────────────────────────────────────");
    console.log("");
    return { sent: true, method: "console" };
  }

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: opts.to,
      subject,
      html,
    });
    return { sent: true, method: "smtp" };
  } catch (err: any) {
    console.error("[email] SMTP send failed:", err.message);
    return { sent: false, method: "smtp", error: err.message };
  }
}

// ─── HTML Template ────────────────────────────────────────────────────────

function buildInvitationHtml(opts: {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-0.5px;">⚡ Unwire AI</span>
    </div>

    <!-- Card -->
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;">
      <h1 style="color:#f8fafc;font-size:22px;font-weight:600;margin:0 0 8px 0;">
        You're invited!
      </h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
        <strong style="color:#e2e8f0;">${opts.inviterName}</strong> has invited you to join
        <strong style="color:#e2e8f0;">${opts.orgName}</strong> on Unwire AI.
      </p>

      <!-- Details -->
      <div style="background:#0f172a;border-radius:10px;padding:16px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;width:110px;">Organization</td>
            <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:500;">${opts.orgName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Your Role</td>
            <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:500;">${opts.role}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Invited by</td>
            <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:500;">${opts.inviterName}</td>
          </tr>
        </table>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${opts.acceptUrl}"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">
          Accept Invitation
        </a>
      </div>

      <!-- Fallback link -->
      <p style="color:#64748b;font-size:12px;text-align:center;margin:0;word-break:break-all;">
        Or copy this link:<br>
        <a href="${opts.acceptUrl}" style="color:#818cf8;">${opts.acceptUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <p style="color:#475569;font-size:11px;text-align:center;margin-top:24px;line-height:1.5;">
      This invitation expires in 7 days.<br>
      If you didn't expect this email, you can safely ignore it.
    </p>
  </div>
</body>
</html>`;
}

// ─── Send alert email ─────────────────────────────────────────────────────

export async function sendAlertEmail(opts: {
  to: string;
  title: string;
  message: string;
  severity: string;
}): Promise<EmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`📧 [EMAIL] Alert → ${opts.to}: [${opts.severity}] ${opts.title}`);
    return { sent: true, method: "console" };
  }

  try {
    await transporter.sendMail({
      from: getFrom(), to: opts.to,
      subject: `[${opts.severity}] ${opts.title} — Unwire AI`,
      html: `<p><strong>${opts.title}</strong></p><p>${opts.message}</p>`,
    });
    return { sent: true, method: "smtp" };
  } catch (err: any) {
    return { sent: false, method: "smtp", error: err.message };
  }
}

// ─── Send deployment email ────────────────────────────────────────────────

export async function sendDeploymentEmail(opts: {
  to: string;
  projectName: string;
  version: number;
  status: string;
  serverName: string;
}): Promise<EmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`📧 [EMAIL] Deployment → ${opts.to}: ${opts.projectName} v${opts.version} ${opts.status}`);
    return { sent: true, method: "console" };
  }

  const icon = opts.status === "SUCCESS" ? "✅" : "❌";
  try {
    await transporter.sendMail({
      from: getFrom(), to: opts.to,
      subject: `${icon} Deployment ${opts.status}: ${opts.projectName} v${opts.version}`,
      html: `<p>${icon} <strong>${opts.projectName}</strong> v${opts.version} deployed to ${opts.serverName}: <strong>${opts.status}</strong></p>`,
    });
    return { sent: true, method: "smtp" };
  } catch (err: any) {
    return { sent: false, method: "smtp", error: err.message };
  }
}
