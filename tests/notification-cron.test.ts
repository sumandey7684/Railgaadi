import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { LiveJourney, Station } from '@/types/train';
import type { JourneyEventDetectionResult } from '@/lib/notification-events';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

const loadCachedLiveJourney = vi.fn();
vi.mock('@/lib/journey-loader', () => ({
  loadCachedLiveJourney: (...args: unknown[]) => loadCachedLiveJourney(...args),
}));

const deliverDetectedNotificationEvents = vi.fn();
vi.mock('@/lib/push-delivery', () => ({
  deliverDetectedNotificationEvents: (...args: unknown[]) => deliverDetectedNotificationEvents(...args),
}));

import { createNotificationRule, resetNotificationMemoryForTests } from '@/lib/notifications';
import {
  MAX_TRAINS_PER_NOTIFICATION_CRON,
  NOTIFICATION_CRON_LOCK_KEY,
  NOTIFICATION_CRON_LOCK_TTL_SECONDS,
  expireNotificationCronLockForTests,
  isAuthorizedCronRequest,
  resetNotificationCronLockForTests,
  runNotificationCron,
} from '@/lib/notification-cron';
import { GET as cronGet } from '@/app/api/cron/notifications/route';

const SECRET = 'cron-test-secret-value';
const INSTALL = 'install-device-01';

function halt(partial: Partial<Station> & Pick<Station, 'code' | 'name' | 'status'>): Station {
  return {
    lat: 0,
    lng: 0,
    scheduledArrival: '10:00',
    scheduledDeparture: '10:05',
    arrivalSource: 'scheduled',
    departureSource: 'scheduled',
    distanceKm: 0,
    isHalt: true,
    ...partial,
  };
}

function journey(trainId: string, overrides: Partial<LiveJourney> = {}): LiveJourney {
  const current = halt({ code: 'BRC', name: 'Vadodara', status: 'current', distanceKm: 400 });
  const prev = halt({ code: 'ST', name: 'Surat', status: 'passed', distanceKm: 260 });
  const next = halt({ code: 'KOTA', name: 'Kota', status: 'upcoming', distanceKm: 900 });
  return {
    trainId,
    number: trainId,
    name: 'Rajdhani',
    origin: { code: 'MMCT', name: 'Mumbai' },
    destination: { code: 'NDLS', name: 'Delhi' },
    currentLocation: { lat: 1, lng: 2, isMoving: true, source: 'station' },
    status: 'running',
    speedSource: 'unknown',
    delayMinutes: 12,
    distanceCoveredKm: 400,
    remainingDistanceKm: 984,
    totalDistanceKm: 1384,
    completionPercentage: 29,
    progressSource: 'station',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    ETA: 'Soon',
    previousStation: prev,
    currentStation: current,
    nextStation: next,
    nextHalt: next,
    stations: [prev, current, next],
    ...overrides,
  };
}

function liveLoad(trainId: string) {
  return {
    ok: true as const,
    journey: journey(trainId),
    dataSource: 'live' as const,
    originSource: 'live' as const,
    cached: false,
  };
}

function cronRequest(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new NextRequest('http://localhost/api/cron/notifications', { headers });
}

describe('notification cron worker', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    resetNotificationCronLockForTests();
    getRedis.mockReturnValue(null);
    logRedisFailure.mockReset();
    loadCachedLiveJourney.mockReset();
    deliverDetectedNotificationEvents.mockReset();
    deliverDetectedNotificationEvents.mockResolvedValue({
      sent: 1,
      expired: 0,
      failed: 0,
      retryable: 0,
      events: [],
    });
    vi.stubEnv('CRON_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized cron requests', async () => {
    expect(isAuthorizedCronRequest(cronRequest())).toBe(false);
    expect(isAuthorizedCronRequest(cronRequest('Bearer wrong'))).toBe(false);
    const res = await cronGet(cronRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('accepts an authorized cron request', async () => {
    const res = await cronGet(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processedTrains).toBe(0);
  });

  it('returns zeros when there are no active rules', async () => {
    const result = await runNotificationCron();
    expect(result).toMatchObject({
      ok: true,
      processedTrains: 0,
      processedRules: 0,
      detectedEvents: 0,
      sent: 0,
      skipped: 0,
    });
    expect(loadCachedLiveJourney).not.toHaveBeenCalled();
  });

  it('fetches the same train only once when multiple rules share it', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_arrived',
    });
    loadCachedLiveJourney.mockResolvedValue(liveLoad('12951'));

    const result = await runNotificationCron();
    expect(result.processedTrains).toBe(1);
    expect(result.processedRules).toBe(2);
    expect(loadCachedLiveJourney).toHaveBeenCalledTimes(1);
    expect(loadCachedLiveJourney).toHaveBeenCalledWith('12951');
  });

  it('processes multiple trains independently', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12952',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockImplementation(async (id: string) => liveLoad(id));

    const result = await runNotificationCron();
    expect(result.processedTrains).toBe(2);
    expect(loadCachedLiveJourney).toHaveBeenCalledTimes(2);
    expect(deliverDetectedNotificationEvents).toHaveBeenCalled();
  });

  it('runs detection then delivery', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockResolvedValue(liveLoad('12951'));

    const result = await runNotificationCron();
    expect(result.detectedEvents).toBeGreaterThanOrEqual(1);
    expect(deliverDetectedNotificationEvents).toHaveBeenCalledTimes(1);
    const detection = deliverDetectedNotificationEvents.mock.calls[0][0] as JourneyEventDetectionResult;
    expect(detection.skipped).toBeNull();
    expect(detection.events[0]?.eventType).toBe('approaching_station');
    expect(result.sent).toBe(1);
  });

  it('does not deliver fallback or unavailable journeys', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockResolvedValueOnce({
      ok: true,
      journey: journey('12951'),
      dataSource: 'fallback',
      originSource: 'fallback',
      cached: false,
    });
    const fallback = await runNotificationCron();
    expect(fallback.skipped).toBeGreaterThanOrEqual(1);
    expect(deliverDetectedNotificationEvents).not.toHaveBeenCalled();

    resetNotificationCronLockForTests();
    loadCachedLiveJourney.mockResolvedValueOnce({
      ok: false,
      dataSource: 'unavailable',
      error: 'BUDGET',
      status: 503,
      code: 'UNAVAILABLE',
    });
    const unavailable = await runNotificationCron();
    expect(unavailable.skipped).toBeGreaterThanOrEqual(1);
    expect(deliverDetectedNotificationEvents).not.toHaveBeenCalled();
  });

  it('holds a concurrent worker lock', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return liveLoad('12951');
    });

    const [a, b] = await Promise.all([runNotificationCron(), runNotificationCron()]);
    const held = [a, b].filter((r) => r.lockHeld);
    const ran = [a, b].filter((r) => !r.lockHeld);
    expect(held).toHaveLength(1);
    expect(ran).toHaveLength(1);
    expect(loadCachedLiveJourney).toHaveBeenCalledTimes(1);
  });

  it('allows a new run after the lock expires', async () => {
    let releaseHang!: () => void;
    const hang = new Promise<JourneyEventDetectionResult>((resolve) => {
      releaseHang = () =>
        resolve({
          trainId: '12951',
          skipped: 'unavailable',
          events: [],
          observedRuleIds: [],
          suppressedDuplicateRuleIds: [],
        });
    });

    const first = runNotificationCron({
      listTrainIds: async () => ['12951'],
      listRules: async () => [],
      detect: () => hang,
    });
    await new Promise((r) => setTimeout(r, 15));
    expireNotificationCronLockForTests();
    const second = await runNotificationCron({ listTrainIds: async () => [] });
    expect(second.lockHeld).toBeUndefined();
    expect(second.processedTrains).toBe(0);
    expect(NOTIFICATION_CRON_LOCK_TTL_SECONDS).toBeLessThan(60);
    expect(NOTIFICATION_CRON_LOCK_KEY).toBe('rg:notify:cron:lock');
    releaseHang();
    await first;
  });

  it('isolates delivery failures per train', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12952',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockImplementation(async (id: string) => liveLoad(id));
    deliverDetectedNotificationEvents.mockImplementation(async (detection: JourneyEventDetectionResult) => {
      if (detection.trainId === '12951') throw new Error('push down');
      return { sent: 1, expired: 0, failed: 0, retryable: 0, events: [] };
    });

    const result = await runNotificationCron();
    expect(result.processedTrains).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBe(1);
  });

  it('loads journeys only through loadCachedLiveJourney (budget/cache path)', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockResolvedValue({
      ok: false,
      dataSource: 'unavailable',
      error: 'RailRadar daily budget exceeded',
      status: 503,
      code: 'UNAVAILABLE',
    });
    const result = await runNotificationCron();
    expect(loadCachedLiveJourney).toHaveBeenCalledTimes(1);
    expect(deliverDetectedNotificationEvents).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(MAX_TRAINS_PER_NOTIFICATION_CRON).toBeGreaterThan(0);
  });

  it('caps trains per execution', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12952',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockImplementation(async (id: string) => liveLoad(id));
    const result = await runNotificationCron({ maxTrains: 1 });
    expect(result.processedTrains).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.skipped).toBe(1);
    expect(loadCachedLiveJourney).toHaveBeenCalledTimes(1);
  });

  it('returns a structured log-safe body without secrets', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    loadCachedLiveJourney.mockResolvedValue(liveLoad('12951'));
    const res = await cronGet(cronRequest(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        processedTrains: expect.any(Number),
        processedRules: expect.any(Number),
        detectedEvents: expect.any(Number),
        sent: expect.any(Number),
        expired: expect.any(Number),
        failed: expect.any(Number),
        retryable: expect.any(Number),
        skipped: expect.any(Number),
      })
    );
    const dump = JSON.stringify(body);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain('VAPID_PRIVATE_KEY');
    expect(dump).not.toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(dump).not.toContain('p256dh');
    expect(dump).not.toContain('privateKey');
  });

  it('does not authorize when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(isAuthorizedCronRequest(cronRequest('Bearer anything'))).toBe(false);
  });
});

describe('vercel cron config', () => {
  it('schedules GET /api/cron/notifications once per minute', () => {
    const raw = readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
    const json = JSON.parse(raw) as { crons: { path: string; schedule: string }[] };
    expect(json.crons).toHaveLength(1);
    expect(json.crons[0].path).toBe('/api/cron/notifications');
    expect(json.crons[0].schedule).toBe('* * * * *');
    const parts = json.crons[0].schedule.split(' ');
    expect(parts).toHaveLength(5);
  });
});
