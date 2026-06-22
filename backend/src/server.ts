import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import projectRoutes    from "./routes/projectRoutes";
import authRoutes       from "./routes/authRoutes";
import serverRoutes     from "./routes/serverRoutes";
import adminRoutes      from "./routes/adminRoutes";
import deploymentRoutes from "./routes/deploymentRoutes";
import agentRoutes      from "./routes/agentRoutes";
import alertRoutes      from "./routes/alertRoutes";
import orgRoutes        from "./routes/orgRoutes";
import dashboardRoutes  from "./routes/dashboardRoutes";
import { prisma } from "./database/db";
import { authenticate, optionalAuth } from "./middleware/authenticate";
import { globalLimiter, authLimiter, deploymentLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/requestLogger";
import { requestIdMiddleware } from "./middleware/requestId";
import { initCache } from "./services/cacheService";
import { setupGracefulShutdown, registerServer } from "./services/shutdown";
import { logger } from "./services/logger";

const app = express();
const PORT = parseInt(process.env.PORT ?? "5000", 10);

// Support comma-separated origins: "http://localhost:8080,http://localhost:3000"
const ALLOWED_ORIGINS: string[] = (process.env.FRONTEND_URL ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ─── Ensure uploads directory exists ──────────────────────────────────────

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded files statically
app.use("/uploads", express.static(uploadsDir));

// ─── Logging & rate limiting ───────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(globalLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────

app.use("/api/auth", authLimiter, authRoutes);

// Attach user to request if token present (optional — never blocks)
app.use(optionalAuth);

app.use("/api/projects",     projectRoutes);
app.use("/api/servers",      serverRoutes);
app.use("/api/admin",        adminRoutes);
app.use("/api/deployments",  deploymentLimiter, deploymentRoutes);
app.use("/api/agent",        agentRoutes);
app.use("/api/alerts",       alertRoutes);
app.use("/api/org",          orgRoutes);
app.use("/api/dashboard",   dashboardRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[unhandled]", err);
    res.status(500).json({ success: false, error: err.message ?? "Internal server error." });
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────

async function start() {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    // Initialize Redis cache (non-blocking — degrades gracefully)
    initCache();

    // Start BullMQ deployment worker (non-blocking, degrades gracefully without Redis)
    const { startDeploymentWorker } = await import("./queue/deploymentWorker");
    await startDeploymentWorker();

    // Start monitoring — prefer BullMQ worker, fall back to in-process engine
    const { startMonitoringWorker } = await import("./monitoring/monitoringWorker");
    const workerStarted = await startMonitoringWorker();
    if (!workerStarted) {
      const { startMonitoringEngine } = await import("./monitoring/monitoringEngine");
      startMonitoringEngine();
    }

    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
    });

    // Register for graceful shutdown
    registerServer(server);
    setupGracefulShutdown();
  } catch (err) {
    logger.error(`Failed to start server: ${err}`);
    process.exit(1);
  }
}

start();
