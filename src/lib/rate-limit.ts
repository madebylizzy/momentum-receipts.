/**
 * In-memory sliding window rate limiter.
 * 
 * This is a per-user, per-endpoint rate limiter that tracks request timestamps
 * in memory. It is not shared across server instances — acceptable for a
 * single-process dev/assessment environment. A production deployment would
 * use Redis or similar shared state.
 * 
 * Configured via CONFIG.UPLOAD_RATE_LIMIT and CONFIG.FOLLOWUP_RATE_LIMIT.
 * Purpose: cost control against a paid AI API, not just abuse prevention.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const stores: Map<string, Map<string, RateLimitEntry>> = new Map();

function getStore(namespace: string): Map<string, RateLimitEntry> {
  if (!stores.has(namespace)) {
    stores.set(namespace, new Map());
  }
  return stores.get(namespace)!;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

export function checkRateLimit(
  namespace: string,
  userId: string,
  config: RateLimitConfig
): RateLimitResult {
  const store = getStore(namespace);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    // Find the earliest timestamp in the window to calculate retry-after
    const earliest = entry.timestamps[0];
    const retryAfterMs = earliest + config.windowMs - now;

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    retryAfterMs: null,
  };
}
