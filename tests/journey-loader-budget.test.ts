import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryConsumeRailRadarBudget = vi.fn();
const getCached = vi.fn();
const setCached = vi.fn();

vi.mock('@/lib/railradar-budget', () => ({
  tryConsumeRailRadarBudget: (...args: unknown[]) => tryConsumeRailRadarBudget(...args),
  RAILRADAR_BUDGET_EXCEEDED:
    'QUOTA_EXCEEDED: RailRadar daily request budget exhausted. Try again tomorrow.',
}));

vi.mock('@/lib/cache', () => ({
  getCached: (...args: unknown[]) => getCached(...args),
  setCached: (...args: unknown[]) => setCached(...args),
}));

vi.mock('@/config/env', () => ({
  env: {
    RAILRADAR_API_KEY: 'test-key',
    RAILRADAR_DAILY_BUDGET: '50',
  },
}));

import { getLiveJourney } from '@/lib/railradar';
import { loadCachedLiveJourney } from '@/lib/journey-loader';

describe('getLiveJourney quota / unavailable contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCached.mockResolvedValue(null);
    setCached.mockResolvedValue(undefined);
  });

  it('returns QUOTA_EXCEEDED without fabricating a journey', async () => {
    tryConsumeRailRadarBudget.mockResolvedValue({
      ok: false,
      used: 50,
      remaining: 0,
      limit: 50,
      retryAfter: 100,
    });

    const result = await getLiveJourney('12951');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe('QUOTA_EXCEEDED');
      expect(result.dataSource).toBe('unavailable');
    }
  });

  it('does not consume budget for invalid train IDs (loader gate)', async () => {
    const result = await loadCachedLiveJourney('abc');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
    expect(tryConsumeRailRadarBudget).not.toHaveBeenCalled();
  });

  it('does not consume budget on cache hit', async () => {
    getCached.mockResolvedValue({
      journey: {
        trainId: '12951',
        number: '12951',
        name: 'Rajdhani',
        origin: { code: 'MMCT', name: 'Mumbai' },
        destination: { code: 'NDLS', name: 'Delhi' },
        currentLocation: { lat: 1, lng: 2, isMoving: true, source: 'gps' },
        status: 'running',
        speedSource: 'unknown',
        distanceCoveredKm: 1,
        remainingDistanceKm: 1,
        totalDistanceKm: 2,
        completionPercentage: 50,
        progressSource: 'gps',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        ETA: 'Soon',
        stations: [],
      },
      originSource: 'live',
    });

    const result = await loadCachedLiveJourney('12951');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dataSource).toBe('cached');
      expect(result.cached).toBe(true);
    }
    expect(tryConsumeRailRadarBudget).not.toHaveBeenCalled();
  });
});
