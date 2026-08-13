import { getRedis, logRedisFailure } from '@/lib/redis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const REDIS_CACHE_PREFIX = 'rg:cache:';

function redisKey(key: string) {
  return `${REDIS_CACHE_PREFIX}${key}`;
}

function getMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setMemory<T>(key: string, value: T, ttlSeconds: number) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Shared cache: Redis when configured, with process-local memory fallback.
 * Callers keep the same key names (e.g. live:12951); Redis stores rg:cache:{key}.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get<T>(redisKey(key));
      if (value != null) return value;
    } catch (error) {
      logRedisFailure(`get ${key}`, error);
    }
  }

  return getMemory<T>(key);
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  // Always keep a local copy for same-instance reads if Redis is down mid-flight.
  setMemory(key, value, ttlSeconds);

  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(redisKey(key), value, { ex: ttlSeconds });
  } catch (error) {
    logRedisFailure(`set ${key}`, error);
  }
}
