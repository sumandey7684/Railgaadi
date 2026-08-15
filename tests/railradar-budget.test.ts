import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import {
  budgetTtlSeconds,
  railradarBudgetKey,
  resetRailRadarBudgetMemoryForTests,
  tryConsumeRailRadarBudget,
} from '@/lib/railradar-budget';

describe('railradar-budget', () => {
  beforeEach(() => {
    resetRailRadarBudgetMemoryForTests();
    getRedis.mockReset();
    logRedisFailure.mockReset();
    getRedis.mockReturnValue(null);
    process.env.RAILRADAR_DAILY_BUDGET = '5';
  });

  it('uses a UTC daily Redis key namespace', () => {
    const now = new Date('2026-08-14T01:00:00.000Z');
    expect(railradarBudgetKey(now)).toBe('rg:budget:railradar:2026-08-14');
    expect(budgetTtlSeconds(now)).toBeGreaterThan(3600);
  });

  it('consumes units from memory when Redis is unset', async () => {
    const a = await tryConsumeRailRadarBudget(2);
    expect(a).toMatchObject({ ok: true, used: 2, remaining: 3, limit: 5 });
    const b = await tryConsumeRailRadarBudget(2);
    expect(b).toMatchObject({ ok: true, used: 4, remaining: 1, limit: 5 });
  });

  it('denies overshoot without consuming extra units', async () => {
    await tryConsumeRailRadarBudget(4);
    const denied = await tryConsumeRailRadarBudget(2);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.used).toBe(4);
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfter).toBeGreaterThan(0);
    }
    const stillOk = await tryConsumeRailRadarBudget(1);
    expect(stillOk).toMatchObject({ ok: true, used: 5, remaining: 0 });
  });

  it('refunds Redis overshoot via DECRBY', async () => {
    const state = { value: 0 };
    const redis = {
      incrby: vi.fn(async (_k: string, n: number) => {
        state.value += n;
        return state.value;
      }),
      decrby: vi.fn(async (_k: string, n: number) => {
        state.value -= n;
        return state.value;
      }),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(1000),
    };
    getRedis.mockReturnValue(redis);
    process.env.RAILRADAR_DAILY_BUDGET = '3';

    await expect(tryConsumeRailRadarBudget(2)).resolves.toMatchObject({ ok: true, used: 2 });
    await expect(tryConsumeRailRadarBudget(2)).resolves.toMatchObject({ ok: false, used: 2 });
    expect(redis.decrby).toHaveBeenCalledWith(railradarBudgetKey(), 2);
    expect(state.value).toBe(2);
  });

  it('falls back to memory when Redis throws', async () => {
    getRedis.mockReturnValue({
      incrby: vi.fn().mockRejectedValue(new Error('WRONGPASS')),
    });
    await expect(tryConsumeRailRadarBudget(1)).resolves.toMatchObject({ ok: true, used: 1 });
    expect(logRedisFailure).toHaveBeenCalled();
  });
});
