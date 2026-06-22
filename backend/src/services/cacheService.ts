/**
 * cacheService.ts
 *
 * Redis caching layer with graceful fallback when Redis is unavailable.
 * Provides typed get/set/invalidate operations with TTL.
 *
 * Used for:
 *  - Dashboard summaries (60s TTL)
 *  - Organization data (30s TTL)
 *  - Alert summaries (15s TTL)
 *  - Server health (30s TTL)
 */

import Redis from "ioredis";

let _redis: Redis | null = null;
let _available = false;

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// ─── Initialize ───────────────────────────────────────────────────────────

export function initCache(): void {
  try {
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableReadyCheck: false,
    });

    _redis.on("connect", () => { _available = true; });
    _redis.on("error", () => { _available = false; });
    _redis.on("close", () => { _available = false; });

    _redis.connect().then(() => {
      _available = true;
      console.log("✓ Redis cache connected");
    }).catch(() => {
      _available = false;
      console.warn("[cache] Redis unavailable — running without cache.");
    });
  } catch {
    _available = false;
    console.warn("[cache] Redis initialization failed — running without cache.");
  }
}

export function isCacheAvailable(): boolean {
  return _available && _redis !== null;
}

// ─── Core operations ──────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!_available || !_redis) return null;
  try {
    const raw = await _redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!_available || !_redis) return;
  try {
    await _redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch { /* non-blocking */ }
}

export async function cacheInvalidate(...keys: string[]): Promise<void> {
  if (!_available || !_redis) return;
  try {
    await _redis.del(...keys);
  } catch { /* non-blocking */ }
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  if (!_available || !_redis) return;
  try {
    const keys = await _redis.keys(pattern);
    if (keys.length > 0) await _redis.del(...keys);
  } catch { /* non-blocking */ }
}

// ─── Shutdown ─────────────────────────────────────────────────────────────

export async function closeCache(): Promise<void> {
  await _redis?.quit().catch(() => {});
  _redis = null;
  _available = false;
}

// ─── Cache key builders ───────────────────────────────────────────────────

export const CacheKeys = {
  dashboardSummary: (userId: string) => `dash:${userId}`,
  alertSummary: (userId: string) => `alerts:summary:${userId}`,
  orgData: (userId: string) => `org:${userId}`,
  serverList: (userId: string) => `servers:${userId}`,
  serverHealth: (serverId: string) => `health:${serverId}`,
};

// TTL values in seconds
export const CacheTTL = {
  dashboard: 60,
  alerts: 15,
  org: 30,
  servers: 30,
  health: 30,
};
