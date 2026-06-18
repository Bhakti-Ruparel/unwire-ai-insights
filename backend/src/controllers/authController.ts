import type { Request, Response } from "express";
import * as authService from "../services/authService";

// ─── POST /api/auth/signup ─────────────────────────────────────────────────

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || typeof email !== "string") {
      res.status(400).json({ success: false, error: "Email is required." });
      return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({ success: false, error: "Password is required." });
      return;
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, error: "Name is required." });
      return;
    }

    const result = await authService.registerUser(email, password, name);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed.";
    const statusCode = message.includes("already exists") ? 409 : 400;
    res.status(statusCode).json({ success: false, error: message });
  }
}

// ─── POST /api/auth/login ──────────────────────────────────────────────────

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || typeof email !== "string") {
      res.status(400).json({ success: false, error: "Email is required." });
      return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({ success: false, error: "Password is required." });
      return;
    }

    const result = await authService.loginUser(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed.";
    res.status(401).json({ success: false, error: message });
  }
}

// ─── GET /api/auth/me ──────────────────────────────────────────────────────

export async function me(req: Request, res: Response): Promise<void> {
  // req.user is set by authenticate middleware
  res.json({ success: true, data: req.user });
}
