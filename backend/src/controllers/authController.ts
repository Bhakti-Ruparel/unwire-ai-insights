import type { Request, Response } from "express";
import * as authService from "../services/authService";

// ─── POST /api/auth/signup ─────────────────────────────────────────────────

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body as Record<string, string>;
    if (!email?.trim())    { res.status(400).json({ success: false, error: "Email is required." }); return; }
    if (!password?.trim()) { res.status(400).json({ success: false, error: "Password is required." }); return; }
    if (!name?.trim())     { res.status(400).json({ success: false, error: "Name is required." }); return; }

    const ua = req.headers["user-agent"] ?? "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ?? req.ip ?? "";

    const result = await authService.registerUser(email, password, name, ua, ip);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const msg  = err instanceof Error ? err.message : "Registration failed.";
    const code = msg.includes("already exists") ? 409 : 400;
    res.status(code).json({ success: false, error: msg });
  }
}

// ─── POST /api/auth/login ──────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as Record<string, string>;
    if (!email?.trim())    { res.status(400).json({ success: false, error: "Email is required." }); return; }
    if (!password?.trim()) { res.status(400).json({ success: false, error: "Password is required." }); return; }

    const ua = req.headers["user-agent"] ?? "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ?? req.ip ?? "";

    const result = await authService.loginUser(email, password, ua, ip);
    res.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed.";
    res.status(401).json({ success: false, error: msg });
  }
}

// ─── POST /api/auth/refresh ────────────────────────────────────────────────

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) { res.status(400).json({ success: false, error: "refreshToken is required." }); return; }

    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token refresh failed.";
    res.status(401).json({ success: false, error: msg });
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) await authService.logoutUser(refreshToken);
    res.json({ success: true, data: { message: "Logged out." } });
  } catch {
    res.json({ success: true, data: { message: "Logged out." } });
  }
}

// ─── GET /api/auth/me ──────────────────────────────────────────────────────

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) { res.status(401).json({ success: false, error: "Not authenticated." }); return; }
    const profile = await authService.getUserProfile(req.user.userId);
    if (!profile) { res.status(404).json({ success: false, error: "User not found." }); return; }
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch profile." });
  }
}

// ─── POST /api/auth/forgot-password ───────────────────────────────────────

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) { res.status(400).json({ success: false, error: "Email is required." }); return; }

    const { requestPasswordReset } = await import("../services/passwordResetService");
    await requestPasswordReset(email.trim());

    // Always return success (prevent email enumeration)
    res.json({ success: true, data: { message: "If the email exists, a reset link has been sent." } });
  } catch {
    res.json({ success: true, data: { message: "If the email exists, a reset link has been sent." } });
  }
}

// ─── GET /api/auth/verify-reset-token/:token ──────────────────────────────

export async function verifyResetToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) { res.status(400).json({ success: false, error: "Token required." }); return; }

    const { verifyResetToken: verify } = await import("../services/passwordResetService");
    const result = await verify(token);

    if (!result.valid) {
      res.status(400).json({ success: false, error: "Invalid or expired reset token." });
      return;
    }
    res.json({ success: true, data: { valid: true, email: result.email } });
  } catch {
    res.status(400).json({ success: false, error: "Token verification failed." });
  }
}

// ─── POST /api/auth/reset-password ────────────────────────────────────────

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token) { res.status(400).json({ success: false, error: "Token is required." }); return; }
    if (!password) { res.status(400).json({ success: false, error: "Password is required." }); return; }

    const { resetPassword: doReset } = await import("../services/passwordResetService");
    const result = await doReset(token, password);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: { message: "Password reset successfully." } });
  } catch {
    res.status(500).json({ success: false, error: "Password reset failed." });
  }
}

// ─── GET /api/auth/profile ────────────────────────────────────────────────

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) { res.status(401).json({ success: false, error: "Not authenticated." }); return; }
    const profile = await authService.getUserProfile(req.user.userId);
    if (!profile) { res.status(404).json({ success: false, error: "User not found." }); return; }
    res.json({ success: true, data: profile });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch profile." });
  }
}

// ─── PATCH /api/auth/profile ──────────────────────────────────────────────

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) { res.status(401).json({ success: false, error: "Not authenticated." }); return; }

    const { name, avatarUrl, company, bio } = req.body;

    // Validate input lengths
    if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
      res.status(400).json({ success: false, error: "Name must be under 100 characters." }); return;
    }
    if (bio !== undefined && (typeof bio !== "string" || bio.length > 500)) {
      res.status(400).json({ success: false, error: "Bio must be under 500 characters." }); return;
    }
    if (company !== undefined && (typeof company !== "string" || company.length > 100)) {
      res.status(400).json({ success: false, error: "Company must be under 100 characters." }); return;
    }

    const updated = await authService.updateUserProfile(req.user.userId, { name, avatarUrl, company, bio });
    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: "Failed to update profile." });
  }
}

// ─── GET /api/auth/sessions ───────────────────────────────────────────────

export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) { res.status(401).json({ success: false, error: "Not authenticated." }); return; }
    const sessions = await authService.getActiveSessions(req.user.userId);
    res.json({ success: true, data: sessions });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch sessions." });
  }
}

// ─── POST /api/auth/logout-all ────────────────────────────────────────────

export async function logoutAll(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) { res.status(401).json({ success: false, error: "Not authenticated." }); return; }
    await authService.logoutAll(req.user.userId);
    res.json({ success: true, data: { message: "All sessions invalidated." } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to logout all sessions." });
  }
}
