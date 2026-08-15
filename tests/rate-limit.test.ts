import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import {
  RATE_LIMIT_MAX_REQUESTS,
  rateLimit,
  resetRateLimitMemoryForTests,
} from '@/lib/rate-limit';
import { middleware } from '@/middleware';

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitMemoryForTests();
    getRedis.mockReset();
    logRedisFailure.mockReset();
    getRedis.mockReturnValue(null);
  });

  it('allows 45 requests/minute then denies', async () => {
    const ip = '1.2.3.4';
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      await expect(rateLimit(ip)).resolves.toEqual({ ok: true });
    }
    const denied = await rateLimit(ip);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfter).toBeGreaterThan(0);
    }
  });

  it('isolates limits per IP', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      await rateLimit('10.0.0.1');
    }
    await expect(rateLimit('10.0.0.2')).resolves.toEqual({ ok: true });
  });

  it('falls back to memory when Redis fails', async () => {
    getRedis.mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error('REDIS_DOWN')),
    });
    await expect(rateLimit('9.9.9.9')).resolves.toEqual({ ok: true });
    expect(logRedisFailure).toHaveBeenCalled();
  });

  it('middleware returns 429 with Retry-After', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      await rateLimit('middleware-ip');
    }

    const req = new NextRequest('http://localhost/api/search?query=12951', {
      headers: { 'x-forwarded-for': 'middleware-ip' },
    });
    const res = await middleware(req);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/RATE_LIMITED/);
    expect(body.dataSource).toBe('unavailable');
  });
});
