import { Redis } from '@upstash/redis';
import { env } from '@/config/env';

let client: Redis | null | undefined;
let missingLogged = false;
let lastFailureLogAt = 0;

export function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

/** Shared Upstash REST client, or null when unset / intentionally disabled. */
export function getRedis(): Redis | null {
  if (!isRedisConfigured()) {
    if (!missingLogged) {
      missingLogged = true;
      console.warn(
        '[redis] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; using in-memory fallback'
      );
    }
    return null;
  }

  if (client === undefined) {
    client = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return client;
}

/** Log Redis errors without spamming (at most once per 10s). */
export function logRedisFailure(operation: string, error: unknown) {
  const now = Date.now();
  if (now - lastFailureLogAt < 10_000) return;
  lastFailureLogAt = now;
  console.error(`[redis] ${operation} failed; falling back to in-memory`, error);
}
