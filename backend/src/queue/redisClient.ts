/**
 * redisClient.ts
 *
 * Provides BullMQ connection options and a Redis availability check.
 * BullMQ bundles its own ioredis — we pass a plain options object
 * to avoid type conflicts between the two ioredis versions.
 *
 * When Redis is not available:
 *  - isRedisAvailable() returns false immediately
 *  - Worker is not started
 *  - Queue operations fall back to no-op
 *  - Server continues running normally
 */

import type { ConnectionOptions } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Cache the availability check — re-probe every 60 seconds to allow recovery
let _cachedAvailable: boolean | null = null;
let _lastCheckTime = 0;
const RECHECK_INTERVAL_MS = 60_000;

/** Parse REDIS_URL into a BullMQ ConnectionOptions object */
export function getRedisConnectionOptions(): ConnectionOptions {
  try {
    const url = new URL(REDIS_URL);
    return {
      host:                 url.hostname || "localhost",
      port:                 parseInt(url.port) || 6379,
      password:             url.password || undefined,
      db:                   url.pathname?.length > 1 ? parseInt(url.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,   // required by BullMQ
      enableReadyCheck:     false,
      lazyConnect:          true,
      // Suppress retry noise — fail fast when Redis isn't present
      retryStrategy: (times: number) => (times > 1 ? null : 200),
    } as ConnectionOptions;
  } catch {
    return {
      host:                 "localhost",
      port:                 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      lazyConnect:          true,
      retryStrategy: (times: number) => (times > 1 ? null : 200),
    } as ConnectionOptions;
  }
}

/**
 * isRedisAvailable
 *
 * One-shot connectivity probe — resolves in ≤ 1 second.
 * Result is cached so subsequent calls return immediately.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_cachedAvailable !== null && (now - _lastCheckTime) < RECHECK_INTERVAL_MS) {
    return _cachedAvailable;
  }

  return new Promise<boolean>((resolve) => {
    // BullMQ bundles ioredis — use it directly to avoid version conflicts
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis");
      const opts = getRedisConnectionOptions() as any;

      const client = new Redis({
        ...opts,
        lazyConnect:          true,
        connectTimeout:       1000,    // 1 second timeout
        maxRetriesPerRequest: 1,
        retryStrategy:        () => null, // no retries during probe
      });

      // Suppress unhandled error events during probe
      client.on("error", () => {});

      client.connect()
        .then(() => client.ping())
        .then(() => {
          client.quit().catch(() => {});
          _cachedAvailable = true;
          _lastCheckTime = Date.now();
          resolve(true);
        })
        .catch(() => {
          client.disconnect(false);
          _cachedAvailable = false;
          _lastCheckTime = Date.now();
          resolve(false);
        });

      // Hard timeout safety net
      setTimeout(() => {
        if (_cachedAvailable === null || (Date.now() - _lastCheckTime) >= RECHECK_INTERVAL_MS) {
          client.disconnect(false);
          _cachedAvailable = false;
          _lastCheckTime = Date.now();
          resolve(false);
        }
      }, 1500);
    } catch {
      _cachedAvailable = false;
      _lastCheckTime = Date.now();
      resolve(false);
    }
  });
}
