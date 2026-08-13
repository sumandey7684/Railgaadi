import { getRedis, logRedisFailure } from '@/lib/redis';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 45;
const REDIS_RATE_PREFIX = 'rg:ratelimit:';

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function rateLimitMemory(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}

/**
 * Fixed-window limiter: 45 requests / 60s / IP.
 * Uses Redis when available so limits apply across instances.
 */
export async function rateLimit(
  ip: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `${REDIS_RATE_PREFIX}${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }

      if (count > MAX_REQUESTS) {
        const ttl = await redis.ttl(key);
        return {
          ok: false,
          retryAfter: Math.max(1, ttl > 0 ? ttl : WINDOW_SECONDS),
        };
      }

      return { ok: true };
    } catch (error) {
      logRedisFailure('rateLimit', error);
    }
  }

  return rateLimitMemory(ip);
}
