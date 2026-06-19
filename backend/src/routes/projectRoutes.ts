import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as controller from "../controllers/projectController";
import { authenticate } from "../middleware/authenticate";
import { requireProjectOwnership } from "../middleware/requireOwnership";
import { uploadLimiter } from "../middleware/rateLimiter";
import { getDeploymentPlan } from "../controllers/deploymentController";

const router = Router();

// ─── Multer (ZIP uploads) ──────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.params.id ?? "unknown";
    const dest = path.join(process.cwd(), "uploads", projectId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted."));
    }
  },
});

// ─── Routes ────────────────────────────────────────────────────────────────

// List & create — require authentication
router.get("/",    authenticate, controller.listProjects);
router.post("/",   authenticate, controller.createProject);

// All single-project routes require authentication + ownership check
router.get("/:id",        authenticate, requireProjectOwnership, controller.getProject);
router.post("/:id/upload", authenticate, requireProjectOwnership, uploadLimiter, upload.single("file"), controller.uploadProjectZip);
router.post("/:id/chat",   authenticate, requireProjectOwnership, controller.chatProject);

// Sub-resources — all require ownership
router.get("/:id/overview",         authenticate, requireProjectOwnership, controller.getProjectOverview);
router.get("/:id/apis",             authenticate, requireProjectOwnership, controller.getProjectAPIs);
router.get("/:id/dependencies",     authenticate, requireProjectOwnership, controller.getProjectDependencies);
router.get("/:id/backend",          authenticate, requireProjectOwnership, controller.getProjectBackend);
router.get("/:id/schema",           authenticate, requireProjectOwnership, controller.getProjectSchema);
router.get("/:id/services",         authenticate, requireProjectOwnership, controller.getProjectServices);
router.get("/:id/report",           authenticate, requireProjectOwnership, controller.getProjectReport);
router.get("/:id/deployment",       authenticate, requireProjectOwnership, controller.getDeployment);
router.post("/:id/deployment/refresh", authenticate, requireProjectOwnership, controller.refreshDeployment);
router.get("/:id/deployment-plan",  authenticate, requireProjectOwnership, getDeploymentPlan);

export default router;
