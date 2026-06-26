/**
 * shutdown.ts
 *
 * Graceful shutdown handler for production.
 * Closes connections in order: HTTP → Workers → Redis → Database.
 */

import type { Server } from "http";
import { prisma } from "../database/db";
import { closeCache } from "./cacheService";
import { logger } from "./logger";

let _server: Server | null = null;

export function registerServer(server: Server): void {
  _server = server;
}

export function setupGracefulShutdown(): void {
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal} — starting graceful shutdown...`);

      // 1. Stop accepting new connections
      if (_server) {
        _server.close(() => logger.info("HTTP server closed."));
      }

      // 2. Stop monitoring engine
      try {
        const { stopMonitoringEngine } = await import("../monitoring/monitoringEngine");
        stopMonitoringEngine();
      } catch { /* ignore */ }

      // 3. Stop workers
      try {
        const { stopDeploymentWorker } = await import("../queue/deploymentWorker");
        await stopDeploymentWorker();
      } catch { /* ignore */ }

      try {
        const { closeIngestionQueue } = await import("../queue/ingestionQueue");
        await closeIngestionQueue();
      } catch { /* ignore */ }

      // 4. Close Redis cache
      await closeCache();

      // 5. Close database
      await prisma.$disconnect();
      logger.info("Graceful shutdown complete.");
      process.exit(0);
    });
  }
}
