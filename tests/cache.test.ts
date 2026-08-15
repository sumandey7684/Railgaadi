import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import {
  cacheRedisKey,
  getCached,
  resetMemoryCacheForTests,
  setCached,
} from '@/lib/cache';
import { liveJourneyCacheKey, LIVE_JOURNEY_TTL_SECONDS } from '@/lib/journey-loader';

describe('cache', () => {
  beforeEach(() => {
    resetMemoryCacheForTests();
    getRedis.mockReset();
    logRedisFailure.mockReset();
    getRedis.mockReturnValue(null);
  });

  it('builds Redis cache keys with the shared prefix', () => {
    expect(cacheRedisKey(liveJourneyCacheKey('12951'))).toBe('rg:cache:live:12951');
    expect(LIVE_JOURNEY_TTL_SECONDS).toBe(30);
  });

  it('stores and reads from memory when Redis is unset', async () => {
    await setCached('live:12951', { ok: true }, 30);
    await expect(getCached<{ ok: boolean }>('live:12951')).resolves.toEqual({ ok: true });
  });

  it('expires memory entries after TTL', async () => {
    vi.useFakeTimers();
    await setCached('live:ttl', { v: 1 }, 10);
    await expect(getCached('live:ttl')).resolves.toEqual({ v: 1 });
    vi.advanceTimersByTime(11_000);
    await expect(getCached('live:ttl')).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('writes through to Redis when available', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const get = vi.fn().mockResolvedValue({ from: 'redis' });
    getRedis.mockReturnValue({ set, get });

    await setCached('live:12951', { from: 'app' }, 30);
    expect(set).toHaveBeenCalledWith('rg:cache:live:12951', { from: 'app' }, { ex: 30 });

    await expect(getCached('live:12951')).resolves.toEqual({ from: 'redis' });
    expect(get).toHaveBeenCalledWith('rg:cache:live:12951');
  });

  it('falls back to memory when Redis get fails', async () => {
    await setCached('live:fallback', { mem: true }, 30);
    getRedis.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('REDIS_DOWN')),
      set: vi.fn().mockRejectedValue(new Error('REDIS_DOWN')),
    });

    await expect(getCached<{ mem: boolean }>('live:fallback')).resolves.toEqual({ mem: true });
    expect(logRedisFailure).toHaveBeenCalled();
  });
});
