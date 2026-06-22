/**
 * serverSSE.ts
 *
 * Server Sent Events (SSE) streaming for real-time server updates.
 * Streams heartbeat updates, metrics, and status changes.
 */

import type { Request, Response } from "express";
import { prisma } from "../database/db";

interface SSEClient {
  serverId: string;
  response: Response;
  lastMetricTime: number;
}

// ─── Active SSE connections ───────────────────────────────────────────────
const activeClients = new Map<string, SSEClient>();

/**
 * Stream server updates via SSE.
 * Client connects and receives real-time updates.
 */
export function subscribeToServerEvents(req: Request, res: Response): void {
  const serverId = req.params.id;
  if (!serverId) {
    res.status(400).json({ error: "serverId is required" });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connection message
  res.write("data: {\"type\":\"connected\",\"serverId\":\"" + serverId + "\"}\n\n");

  // Store client connection
  const clientId = `${serverId}-${Date.now()}-${Math.random()}`;
  activeClients.set(clientId, {
    serverId,
    response: res,
    lastMetricTime: Date.now(),
  });

  // Clean up on disconnect
  const cleanup = () => {
    activeClients.delete(clientId);
    res.end();
  };

  res.on("close", cleanup);
  res.on("error", cleanup);

  // Send keepalive every 30 seconds
  const keepalive = setInterval(() => {
    if (res.writableEnded) {
      cleanup();
      return;
    }
    res.write(": keepalive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepalive);
    cleanup();
  });
}

/**
 * Broadcast an event to all connected clients for a server.
 */
export function broadcastServerEvent(
  serverId: string,
  type: "heartbeat" | "metric" | "log" | "status" | "app",
  data: unknown
): void {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

  for (const [, client] of activeClients) {
    if (client.serverId === serverId && !client.response.writableEnded) {
      try {
        client.response.write(`data: ${message}\n\n`);
      } catch (err) {
        // Client might have disconnected; it will be cleaned up on next event
      }
    }
  }
}

/**
 * Get count of active SSE subscribers for a server.
 */
export function getSubscriberCount(serverId: string): number {
  let count = 0;
  for (const client of activeClients.values()) {
    if (client.serverId === serverId && !client.response.writableEnded) {
      count++;
    }
  }
  return count;
}

/**
 * Broadcast a metric update when new metrics are received.
 */
export async function broadcastMetricIfSubscribers(serverId: string): Promise<void> {
  // Only fetch metric if there are active subscribers
  const subCount = getSubscriberCount(serverId);
  if (subCount === 0) return;

  try {
    const metric = await prisma.serverMetric.findFirst({
      where: { serverId },
      orderBy: { recordedAt: "desc" },
      take: 1,
    });

    if (metric) {
      broadcastServerEvent(serverId, "metric", {
        cpuPercent: metric.cpuPercent,
        ramPercent: metric.ramPercent,
        diskPercent: metric.diskPercent,
        recordedAt: metric.recordedAt.toISOString(),
      });
    }
  } catch (err) {
    // Silently fail if broadcast fails
  }
}

/**
 * Broadcast a heartbeat update.
 */
export function broadcastHeartbeat(serverId: string, status: string): void {
  broadcastServerEvent(serverId, "heartbeat", {
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast a log entry when new logs are received.
 */
export function broadcastLog(
  serverId: string,
  log: { appName: string; level: string; message: string; timestamp: string }
): void {
  broadcastServerEvent(serverId, "log", log);
}

/**
 * Broadcast server status change.
 */
export function broadcastStatusChange(serverId: string, status: string): void {
  broadcastServerEvent(serverId, "status", { status, timestamp: new Date().toISOString() });
}
