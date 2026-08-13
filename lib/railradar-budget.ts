import { env } from '@/config/env';
import { getRedis, logRedisFailure } from '@/lib/redis';

const BUDGET_PREFIX = 'rg:budget:railradar:';

interface MemoryBudget {
  count: number;
  resetAt: number;
}

const memoryBudgets = new Map<string, MemoryBudget>();

function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function railradarBudgetKey(now = new Date()): string {
  return `${BUDGET_PREFIX}${utcDateKey(now)}`;
}

/** Seconds until end of UTC day, plus a 1h buffer so keys expire cleanly. */
export function budgetTtlSeconds(now = new Date()): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((end - now.getTime()) / 1000) + 3600);
}

export function getRailRadarDailyBudgetLimit(): number {
  const parsed = Number.parseInt(env.RAILRADAR_DAILY_BUDGET, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 50;
}

export type BudgetConsumeResult =
  | { ok: true; used: number; remaining: number; limit: number }
  | {
      ok: false;
      used: number;
      remaining: 0;
      limit: number;
      retryAfter: number;
    };

function consumeMemory(units: number, limit: number, now = new Date()): BudgetConsumeResult {
  const key = railradarBudgetKey(now);
  const resetAt =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) + 3600_000;

  let entry = memoryBudgets.get(key);
  if (!entry || now.getTime() >= entry.resetAt) {
    entry = { count: 0, resetAt };
    memoryBudgets.set(key, entry);
  }

  if (entry.count + units > limit) {
    return {
      ok: false,
      used: entry.count,
      remaining: 0,
      limit,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now.getTime()) / 1000)),
    };
  }

  entry.count += units;
  // Keep map from growing across days
  if (memoryBudgets.size > 8) {
    for (const [k, v] of memoryBudgets) {
      if (now.getTime() >= v.resetAt) memoryBudgets.delete(k);
    }
  }

  return {
    ok: true,
    used: entry.count,
    remaining: Math.max(0, limit - entry.count),
    limit,
  };
}

/**
 * Atomically consume `units` from the shared daily RailRadar request budget.
 * Redis key: rg:budget:railradar:YYYY-MM-DD (UTC). Falls back to process memory
 * when Redis is unset or errors — same pattern as rate-limit/cache.
 */
export async function tryConsumeRailRadarBudget(units = 1): Promise<BudgetConsumeResult> {
  const limit = getRailRadarDailyBudgetLimit();
  const safeUnits = Math.max(1, Math.floor(units));
  const now = new Date();
  const key = railradarBudgetKey(now);

  const redis = getRedis();
  if (redis) {
    try {
      const used = await redis.incrby(key, safeUnits);
      if (used === safeUnits) {
        await redis.expire(key, budgetTtlSeconds(now));
      }

      if (used > limit) {
        await redis.decrby(key, safeUnits);
        const ttl = await redis.ttl(key);
        return {
          ok: false,
          used: Math.max(0, used - safeUnits),
          remaining: 0,
          limit,
          retryAfter: Math.max(1, ttl > 0 ? ttl : budgetTtlSeconds(now)),
        };
      }

      return {
        ok: true,
        used,
        remaining: Math.max(0, limit - used),
        limit,
      };
    } catch (error) {
      logRedisFailure('railradarBudget', error);
    }
  }

  return consumeMemory(safeUnits, limit, now);
}

export const RAILRADAR_BUDGET_EXCEEDED =
  'QUOTA_EXCEEDED: RailRadar daily request budget exhausted. Try again tomorrow.';
