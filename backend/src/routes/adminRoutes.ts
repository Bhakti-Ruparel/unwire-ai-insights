import { Router } from "express";
import { requireAdmin } from "../middleware/authenticate";
import * as adminSvc from "../admin/adminService";

const router = Router();

// All admin routes require ADMIN role
router.use(requireAdmin);

// ─── Overview ──────────────────────────────────────────────────────────────
router.get("/overview", async (req, res) => {
  try {
    const data = await adminSvc.getSystemOverview();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch overview." });
  }
});

// ─── Users list ────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
    const search = req.query.search as string | undefined;
    const role   = req.query.role   as string | undefined;
    const data   = await adminSvc.listUsers({ page, limit, search, role });
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch users." });
  }
});

// ─── User detail ───────────────────────────────────────────────────────────
router.get("/users/:userId", async (req, res) => {
  try {
    const data = await adminSvc.getUserDetail(req.params.userId);
    if (!data) { res.status(404).json({ success: false, error: "User not found." }); return; }
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch user." });
  }
});

// ─── Enable / disable user ─────────────────────────────────────────────────
router.patch("/users/:userId/status", async (req, res) => {
  try {
    const { isActive } = req.body as { isActive: boolean };
    if (typeof isActive !== "boolean") {
      res.status(400).json({ success: false, error: "isActive (boolean) required." }); return;
    }
    await adminSvc.setUserActive(req.params.userId, isActive);
    res.json({ success: true, data: { message: `User ${isActive ? "enabled" : "disabled"}.` } });
  } catch { res.status(500).json({ success: false, error: "Failed to update user." }); }
});

// ─── Change role ───────────────────────────────────────────────────────────
router.patch("/users/:userId/role", async (req, res) => {
  try {
    const { role } = req.body as { role: string };
    if (!["USER", "ADMIN"].includes(role)) {
      res.status(400).json({ success: false, error: "role must be USER or ADMIN." }); return;
    }
    await adminSvc.setUserRole(req.params.userId, role as "USER" | "ADMIN");
    res.json({ success: true, data: { message: "Role updated." } });
  } catch { res.status(500).json({ success: false, error: "Failed to update role." }); }
});

// ─── Delete user ───────────────────────────────────────────────────────────
router.delete("/users/:userId", async (req, res) => {
  try {
    // Prevent self-delete
    if (req.user?.userId === req.params.userId) {
      res.status(400).json({ success: false, error: "Cannot delete your own account." }); return;
    }
    await adminSvc.deleteUserAccount(req.params.userId);
    res.json({ success: true, data: { message: "User deleted." } });
  } catch { res.status(500).json({ success: false, error: "Failed to delete user." }); }
});

// ─── Usage stats ───────────────────────────────────────────────────────────
router.get("/usage", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await adminSvc.getUsageStats(Math.min(365, days));
    res.json({ success: true, data });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch usage." }); }
});

export default router;
