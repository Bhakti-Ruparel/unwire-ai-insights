/**
 * softwareController.ts
 *
 * HTTP handlers for the software marketplace.
 */

import type { Request, Response } from "express";
import { SOFTWARE_REGISTRY, searchSoftware, getSoftwareById, getCategories } from "../software/softwareRegistry";
import * as svc from "../software/softwareService";

// ─── GET /api/software/registry ───────────────────────────────────────────
export async function listRegistry(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      software: SOFTWARE_REGISTRY.map(toPublic),
      categories: getCategories(),
      total: SOFTWARE_REGISTRY.length,
    },
  });
}

// ─── GET /api/software/registry/search?q= ────────────────────────────────
export async function searchRegistry(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) ?? "";
  const category = req.query.category as string | undefined;
  let results = searchSoftware(q);
  if (category) results = results.filter((s) => s.category === category);
  res.json({ success: true, data: results.map(toPublic) });
}

// ─── GET /api/software/registry/:id ───────────────────────────────────────
export async function getRegistryEntry(req: Request, res: Response): Promise<void> {
  const entry = getSoftwareById(req.params.id);
  if (!entry) { res.status(404).json({ success: false, error: "Software not found." }); return; }
  res.json({ success: true, data: toPublic(entry) });
}

// ─── GET /api/software/servers/:id/installed ──────────────────────────────
export async function getInstalled(req: Request, res: Response): Promise<void> {
  try {
    const installed = await svc.getInstalledSoftware(req.params.id);
    res.json({ success: true, data: installed });
  } catch { res.status(500).json({ success: false, error: "Failed to fetch installed software." }); }
}

// ─── POST /api/software/servers/:id/install ───────────────────────────────
export async function installSoftware(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { softwareId, version } = req.body;
    if (!softwareId) { res.status(400).json({ success: false, error: "softwareId is required." }); return; }

    const result = await svc.installSoftware({
      serverId: req.params.id,
      softwareId,
      version,
      userId,
      organizationId: (req as any).org?.id,
    });

    res.status(202).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Installation failed.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── POST /api/software/servers/:id/uninstall ─────────────────────────────
export async function uninstallSoftware(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { softwareId } = req.body;
    if (!softwareId) { res.status(400).json({ success: false, error: "softwareId is required." }); return; }

    await svc.uninstallSoftware({
      serverId: req.params.id,
      softwareId,
      userId,
      organizationId: (req as any).org?.id,
    });

    res.json({ success: true, data: { message: "Uninstalled." } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Uninstallation failed.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── POST /api/software/servers/:id/bootstrap ─────────────────────────────
export async function bootstrapServer(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const result = await svc.bootstrapServer({
      serverId: req.params.id,
      userId,
      organizationId: (req as any).org?.id,
    });

    res.status(202).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bootstrap failed.";
    res.status(400).json({ success: false, error: msg });
  }
}

// ─── Helper: strip internal commands from public response ─────────────────
function toPublic(entry: any) {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    icon: entry.icon,
    versions: entry.versions,
    defaultVersion: entry.defaultVersion,
    tags: entry.tags,
    website: entry.website,
  };
}
