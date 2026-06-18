import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as controller from "../controllers/projectController";
import { authenticate } from "../middleware/authenticate";

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
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted."));
    }
  },
});

// ─── Routes ────────────────────────────────────────────────────────────────

// Project CRUD (authenticate is optional — pass userId if token present)
router.get("/",           controller.listProjects);
router.get("/:id",        controller.getProject);
router.post("/",          controller.createProject);

// ZIP upload
router.post("/:id/upload", upload.single("file"), controller.uploadProjectZip);

// Project Chat
router.post("/:id/chat", controller.chatProject);

// Sub-resources
router.get("/:id/overview",      controller.getProjectOverview);
router.get("/:id/apis",          controller.getProjectAPIs);
router.get("/:id/dependencies",  controller.getProjectDependencies);
router.get("/:id/backend",       controller.getProjectBackend);
router.get("/:id/schema",        controller.getProjectSchema);
router.get("/:id/services",      controller.getProjectServices);
router.get("/:id/report",        controller.getProjectReport);

// Deployment Intelligence
router.get("/:id/deployment",           controller.getDeployment);
router.post("/:id/deployment/refresh",  controller.refreshDeployment);

export default router;
