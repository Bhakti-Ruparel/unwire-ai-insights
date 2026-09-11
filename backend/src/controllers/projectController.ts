import type { Request, Response } from "express";
import * as projectService from "../services/projectService";
import { generateProjectReport } from "../services/reportService";
import { getDeploymentAnalysis, triggerDeploymentAnalysis } from "../deployment/deploymentService";
import type { CreateProjectBody, ApiResponse } from "../models/Project";
import { handleProjectChat } from "../ai/chatService";

// ─── GET /api/projects ─────────────────────────────────────────────────────

export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const projects = await projectService.getAllProjects(userId);
    res.json({ success: true, data: projects });
  } catch (err) {
    console.error("[listProjects]", err);
    res.status(500).json({ success: false, error: "Failed to fetch projects." });
  }
}

// ─── GET /api/projects/:id ─────────────────────────────────────────────────

export async function getProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const project = await projectService.getProjectById(req.params.id, userId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found." });
      return;
    }
    res.json({ success: true, data: project });
  } catch (err) {
    console.error("[getProject]", err);
    res.status(500).json({ success: false, error: "Failed to fetch project." });
  }
}

// ─── POST /api/projects ────────────────────────────────────────────────────

export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as CreateProjectBody;
    const userId = req.user?.userId;

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ success: false, error: "Project name is required." });
      return;
    }
    if (!["zip", "github"].includes(body.sourceType)) {
      res.status(400).json({ success: false, error: "sourceType must be 'zip' or 'github'." });
      return;
    }
    if (body.sourceType === "github" && !body.githubUrl) {
      res.status(400).json({ success: false, error: "githubUrl is required for GitHub projects." });
      return;
    }

    const project = await projectService.createProjectRecord(
      { name: body.name.trim(), sourceType: body.sourceType, githubUrl: body.githubUrl },
      undefined,
      userId
    );

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    console.error("[createProject]", err);
    res.status(500).json({ success: false, error: "Failed to create project." });
  }
}

// ─── POST /api/projects/:id/upload ────────────────────────────────────────

export async function uploadProjectZip(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "No file uploaded." });
      return;
    }
    console.log("[UPLOAD] projectId:", req.params.id, "zipPath:", file.path);
    await projectService.attachUpload(req.params.id, file.path);
    res.json({ success: true, data: { message: "Upload received. Analysis started.", filePath: file.path } });
  } catch (err) {
    console.error("[uploadProjectZip]", err);
    res.status(500).json({ success: false, error: "Failed to process upload." });
  }
}

// ─── GET /api/projects/:id/apis ───────────────────────────────────────────

export async function getProjectAPIs(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectAPIs(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectAPIs]", err);
    res.status(500).json({ success: false, error: "Failed to fetch API endpoints." });
  }
}

// ─── GET /api/projects/:id/dependencies ──────────────────────────────────

export async function getProjectDependencies(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectDependencies(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectDependencies]", err);
    res.status(500).json({ success: false, error: "Failed to fetch dependencies." });
  }
}

// ─── GET /api/projects/:id/backend ───────────────────────────────────────

export async function getProjectBackend(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectBackend(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: "Backend info not yet available." });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectBackend]", err);
    res.status(500).json({ success: false, error: "Failed to fetch backend info." });
  }
}

// ─── GET /api/projects/:id/schema ────────────────────────────────────────

export async function getProjectSchema(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectSchema(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectSchema]", err);
    res.status(500).json({ success: false, error: "Failed to fetch database schema." });
  }
}

// ─── GET /api/projects/:id/services ──────────────────────────────────────

export async function getProjectServices(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectExternalServices(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectServices]", err);
    res.status(500).json({ success: false, error: "Failed to fetch external services." });
  }
}

// ─── GET /api/projects/:id/overview ──────────────────────────────────────

export async function getProjectOverview(req: Request, res: Response): Promise<void> {
  try {
    const data = await projectService.getProjectOverview(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: "Project overview not found." });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("[getProjectOverview]", err);
    res.status(500).json({ success: false, error: "Failed to fetch project overview." });
  }
}

// ─── GET /api/projects/:id/report ────────────────────────────────────────

export async function getProjectReport(req: Request, res: Response): Promise<void> {
  try {
    const markdown = await generateProjectReport(req.params.id);
    if (!markdown) {
      res.status(404).json({ success: false, error: "Project not found." });
      return;
    }
    // Return as downloadable .md file
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="unwire-report-${req.params.id}.md"`);
    res.send(markdown);
  } catch (err) {
    console.error("[getProjectReport]", err);
    res.status(500).json({ success: false, error: "Failed to generate report." });
  }
}

// ─── POST /api/projects/:id/chat ──────────────────────────────────────────

export async function chatProject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { message, sessionId } = req.body as { message: string; sessionId?: string };
    
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ success: false, error: "Message is required." });
      return;
    }
    
    console.log(`[chatProject] project: ${id}, msg: "${message.slice(0, 60)}"`);
    const chatResult = await handleProjectChat(id, message, sessionId);
    
    res.json({
      success: true,
      data: {
        answer: chatResult.answer,
        sources: chatResult.sources,
        sessionId: chatResult.sessionId,
      },
    });
  } catch (err) {
    console.error("[chatProject]", err);
    res.status(500).json({ success: false, error: "Failed to process chat query." });
  }
}

// ─── GET /api/projects/:id/deployment ────────────────────────────────────

export async function getDeployment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Check project exists
    const project = await projectService.getProjectById(id);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found." });
      return;
    }

    const data = await getDeploymentAnalysis(id);

    if (!data) {
      // Analysis hasn't run yet — trigger it now and return pending status
      triggerDeploymentAnalysis(id);
      res.json({
        success: true,
        data: {
          projectId: id,
          status: "pending",
          score: 0,
          scoreBreakdown: {},
          filesDetected: [],
          issues: [],
          recommendations: [],
          architectureNodes: [],
          architectureEdges: [],
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("[getDeployment]", err);
    res.status(500).json({ success: false, error: "Failed to fetch deployment analysis." });
  }
}

// ─── POST /api/projects/:id/deployment/refresh ────────────────────────────

export async function refreshDeployment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const project = await projectService.getProjectById(id);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found." });
      return;
    }
    triggerDeploymentAnalysis(id);
    res.json({ success: true, data: { message: "Deployment analysis queued." } });
  } catch (err) {
    console.error("[refreshDeployment]", err);
    res.status(500).json({ success: false, error: "Failed to trigger deployment analysis." });
  }
}


// ─── Environment Variables ────────────────────────────────────────────────

export async function getEnvVars(req: Request, res: Response): Promise<void> {
  try {
    const { getProjectEnvVars } = await import("../deployment/envVarService");
    const vars = await getProjectEnvVars(req.params.id);
    res.json({ success: true, data: vars });
  } catch {
    res.status(500).json({ success: false, error: "Failed to fetch environment variables." });
  }
}

export async function setEnvVars(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { vars } = req.body as { vars?: Array<{ key: string; value: string; isSecret?: boolean }> };
    if (!Array.isArray(vars)) {
      res.status(400).json({ success: false, error: "vars must be an array of {key, value, isSecret}." });
      return;
    }

    // Validate entries
    for (const v of vars) {
      if (!v.key || typeof v.key !== "string") {
        res.status(400).json({ success: false, error: "Each var must have a key." });
        return;
      }
    }

    const { setProjectEnvVars } = await import("../deployment/envVarService");
    await setProjectEnvVars(
      req.params.id,
      vars.map(v => ({ key: v.key.trim(), value: v.value ?? "", isSecret: v.isSecret ?? false })),
      userId,
      (req as any).org?.id
    );

    res.json({ success: true, data: { saved: vars.length } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to save environment variables." });
  }
}

export async function deleteEnvVar(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required." }); return; }

    const { deleteProjectEnvVar } = await import("../deployment/envVarService");
    await deleteProjectEnvVar(req.params.id, req.params.key, userId);

    res.json({ success: true, data: { deleted: req.params.key } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to delete environment variable." });
  }
}
