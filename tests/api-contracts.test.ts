import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/journey-loader', () => ({
  loadCachedLiveJourney: vi.fn(),
}));

vi.mock('@/lib/railradar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/railradar')>('@/lib/railradar');
  return {
    ...actual,
    searchTrains: vi.fn(),
    RailRadarQuotaError: actual.RailRadarQuotaError,
  };
});

vi.mock('@/lib/cache', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/trains-db', () => ({
  searchLocalTrains: vi.fn(),
}));

import { GET as getTrain } from '@/app/api/train/[id]/route';
import { GET as getSearch } from '@/app/api/search/route';
import { loadCachedLiveJourney } from '@/lib/journey-loader';
import { RailRadarQuotaError, searchTrains } from '@/lib/railradar';
import { searchLocalTrains } from '@/lib/trains-db';

const loadJourney = vi.mocked(loadCachedLiveJourney);
const searchLive = vi.mocked(searchTrains);
const searchLocal = vi.mocked(searchLocalTrains);

function trainReq(id: string) {
  return getTrain(new NextRequest(`http://localhost/api/train/${id}`), {
    params: { id },
  });
}

describe('API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid live train journey', async () => {
    loadJourney.mockResolvedValue({
      ok: true,
      journey: {
        trainId: '12951',
        number: '12951',
        name: 'Rajdhani',
        origin: { code: 'MMCT', name: 'Mumbai' },
        destination: { code: 'NDLS', name: 'Delhi' },
        currentLocation: { lat: 1, lng: 2, isMoving: true, source: 'gps' },
        status: 'running',
        speedSource: 'unknown',
        distanceCoveredKm: 10,
        remainingDistanceKm: 90,
        totalDistanceKm: 100,
        completionPercentage: 10,
        progressSource: 'gps',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        ETA: 'Soon',
        stations: [],
      },
      dataSource: 'live',
      originSource: 'live',
      cached: false,
    });

    const res = await trainReq('12951');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.dataSource).toBe('live');
    expect(body.data.number).toBe('12951');
  });

  it('rejects invalid train IDs with 400', async () => {
    loadJourney.mockResolvedValue({
      ok: false,
      dataSource: 'unavailable',
      error: 'Invalid train ID. Use a 4–5 digit train number.',
      status: 400,
      code: 'UNAVAILABLE',
    });

    const res = await trainReq('abc');
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.dataSource).toBe('unavailable');
    expect(body.data).toBeUndefined();
  });

  it('returns unavailable for missing trains without fabricating data', async () => {
    loadJourney.mockResolvedValue({
      ok: false,
      dataSource: 'unavailable',
      error: 'Live journey not found for train',
      status: 404,
      code: 'NOT_FOUND',
    });

    const res = await trainReq('00000');
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.dataSource).toBe('unavailable');
    expect(body.data).toBeUndefined();
  });

  it('returns local search results as fallback (never live)', async () => {
    searchLocal.mockReturnValue([
      {
        number: '12951',
        name: 'New Delhi Tejas Rajdhani Express',
        from: 'Mumbai Central',
        fromCode: 'MMCT',
        to: 'New Delhi',
        toCode: 'NDLS',
      },
    ]);

    const res = await getSearch(new NextRequest('http://localhost/api/search?query=12951'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dataSource).toBe('fallback');
    expect(body.data[0].number).toBe('12951');
    expect(searchLive).not.toHaveBeenCalled();
  });

  it('performs live lookup on numeric miss', async () => {
    searchLocal.mockReturnValue([]);
    searchLive.mockResolvedValue([
      {
        id: '99991',
        number: '99991',
        name: 'Mystery Express',
        origin: { code: '', name: '' },
        destination: { code: '', name: '' },
      },
    ]);

    const res = await getSearch(new NextRequest('http://localhost/api/search?query=99991'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dataSource).toBe('live');
    expect(body.data[0].number).toBe('99991');
    expect(searchLive).toHaveBeenCalledWith('99991');
  });

  it('returns 429 when RailRadar quota is exceeded', async () => {
    searchLocal.mockReturnValue([]);
    searchLive.mockRejectedValue(new RailRadarQuotaError());

    const res = await getSearch(new NextRequest('http://localhost/api/search?query=88888'));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.dataSource).toBe('unavailable');
    expect(body.error).toMatch(/QUOTA_EXCEEDED/);
    expect(body.data).toEqual([]);
  });
});
