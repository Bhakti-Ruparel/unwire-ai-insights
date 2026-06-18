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
