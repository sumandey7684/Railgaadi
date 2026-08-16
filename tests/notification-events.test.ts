import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveJourney, Station } from '@/types/train';
import type { NotificationRule } from '@/types/notifications';

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

import {
  createNotificationRule,
  getNotificationRule,
  resetNotificationMemoryForTests,
} from '@/lib/notifications';
import {
  detectJourneyNotificationEvents,
  detectNotificationEventsForSnapshot,
  isNotifiableJourneySource,
  planRuleDetection,
  snapshotFromJourney,
} from '@/lib/notification-events';
import { journeyNotifySnapshot } from '@/lib/notifications';

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

function journey(overrides: Partial<LiveJourney> = {}): LiveJourney {
  const current = halt({ code: 'BRC', name: 'Vadodara', status: 'current', distanceKm: 400 });
  const prev = halt({ code: 'ST', name: 'Surat', status: 'passed', distanceKm: 260 });
  const next = halt({ code: 'KOTA', name: 'Kota', status: 'upcoming', distanceKm: 900 });
  return {
    trainId: '12951',
    number: '12951',
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

describe('notifiable sources', () => {
  it('rejects fallback and unavailable', () => {
    expect(isNotifiableJourneySource('live', 'live')).toBe(true);
    expect(isNotifiableJourneySource('cached', 'live')).toBe(true);
    expect(isNotifiableJourneySource('fallback', 'fallback')).toBe(false);
    expect(isNotifiableJourneySource('cached', 'fallback')).toBe(false);
    expect(isNotifiableJourneySource('unavailable')).toBe(false);
  });
});

describe('detectNotificationEventsForSnapshot', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    getRedis.mockReturnValue(null);
    logRedisFailure.mockReset();
  });

  it('skips invalid train IDs', async () => {
    const result = await detectNotificationEventsForSnapshot({
      trainId: 'abc',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [],
      dataSource: 'live',
    });
    expect(result.skipped).toBe('invalid_train_id');
    expect(result.events).toEqual([]);
  });

  it('does not emit events for fallback or unavailable data', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const snap = journeyNotifySnapshot(journey());
    const fallback = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [rule],
      dataSource: 'fallback',
      originSource: 'fallback',
    });
    expect(fallback.skipped).toBe('fallback');
    expect(fallback.events).toEqual([]);

    const unavailable = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [rule],
      dataSource: 'unavailable',
    });
    expect(unavailable.skipped).toBe('unavailable');
    expect(unavailable.events).toEqual([]);
  });

  it('observes next_station_changed on first poll without firing', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'next_station_changed',
    });
    const first = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [rule],
      dataSource: 'live',
    });
    expect(first.events).toEqual([]);
    expect(first.observedRuleIds).toEqual([rule.id]);
  });

  it('fires approaching_station on first live observation when next halt exists', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const result = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [rule],
      dataSource: 'live',
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('approaching_station');
    expect(result.events[0].marker).toBe('approaching:KOTA');
  });

  it('does not fire approaching when next halt is missing', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
      stationCode: 'KOTA',
    });
    const j = journey({ nextHalt: undefined, nextStation: undefined });
    const result = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snapshotFromJourney(j),
      rules: [rule],
      dataSource: 'live',
    });
    expect(result.events).toEqual([]);
    expect(planRuleDetection(rule, result.snapshot!).action).toBe('observe');
  });

  it('fires station_arrived and station_departed from snapshot codes', async () => {
    const arrived = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_arrived',
      stationCode: 'BRC',
    });
    const departed = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_departed',
      stationCode: 'ST',
    });
    const result = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [arrived, departed],
      dataSource: 'cached',
      originSource: 'live',
    });
    expect(result.events.map((e) => e.eventType).sort()).toEqual(['station_arrived', 'station_departed']);
  });

  it('fires next_station_changed only after the first stored observation', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'next_station_changed',
    });
    const first = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [rule],
      dataSource: 'live',
    });
    expect(first.events).toEqual([]);
    expect(first.observedRuleIds).toEqual([rule.id]);

    const stored = await getNotificationRule(rule.id);
    const result = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(
        journey({
          nextHalt: halt({ code: 'NDLS', name: 'Delhi', status: 'upcoming' }),
          nextStation: halt({ code: 'NDLS', name: 'Delhi', status: 'upcoming' }),
        })
      ),
      rules: [stored!],
      dataSource: 'live',
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].marker).toBe('next:NDLS');
  });

  it('crosses delay threshold, ignores still-late polls, re-triggers after idle', async () => {
    const created = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'delay_threshold',
      delayThresholdMinutes: 10,
    });
    const fire = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ delayMinutes: 12 })),
      rules: [created],
      dataSource: 'live',
    });
    expect(fire.events).toHaveLength(1);
    expect(fire.events[0].marker).toBe('delay:active:10');

    const still = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ delayMinutes: 40 })),
      rules: [(await getNotificationRule(created.id))!],
      dataSource: 'live',
    });
    expect(still.events).toEqual([]);

    const idle = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ delayMinutes: 2 })),
      rules: [(await getNotificationRule(created.id))!],
      dataSource: 'live',
    });
    expect(idle.events).toEqual([]);
    expect(idle.observedRuleIds).toEqual([created.id]);

    const again = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ delayMinutes: 11 })),
      rules: [(await getNotificationRule(created.id))!],
      dataSource: 'live',
    });
    expect(again.events).toHaveLength(1);
  });

  it('fires journey_completed on transition to completed', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'journey_completed',
    });
    await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ status: 'running' })),
      rules: [rule],
      dataSource: 'live',
    });
    const done = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey({ status: 'completed' })),
      rules: [(await getNotificationRule(rule.id))!],
      dataSource: 'live',
    });
    expect(done.events[0]?.eventType).toBe('journey_completed');
  });

  it('repeated identical polls emit at most once', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_arrived',
    });
    const snap = journeyNotifySnapshot(journey());
    const a = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [rule],
      dataSource: 'live',
    });
    const b = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [(await getNotificationRule(rule.id))!],
      dataSource: 'live',
    });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(0);
  });

  it('evaluates multiple rules for the same train independently', async () => {
    const a = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const b = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'journey_completed',
    });
    const result = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: journeyNotifySnapshot(journey()),
      rules: [a, b],
      dataSource: 'live',
    });
    expect(result.events.map((e) => e.eventType)).toEqual(['approaching_station']);
    expect(result.observedRuleIds).toContain(b.id);
  });

  it('suppresses duplicate fires via SET NX on the same marker', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const snap = journeyNotifySnapshot(journey());
    const first = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [rule],
      dataSource: 'live',
    });
    const again = await detectNotificationEventsForSnapshot({
      trainId: '12951',
      snapshot: snap,
      rules: [{ ...rule, lastObservedMarker: undefined }],
      dataSource: 'live',
    });
    expect(first.events).toHaveLength(1);
    expect(again.events).toEqual([]);
    expect(again.suppressedDuplicateRuleIds).toEqual([rule.id]);
  });
});

describe('detectJourneyNotificationEvents loader path', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    getRedis.mockReturnValue(null);
    loadCachedLiveJourney.mockReset();
  });

  it('skips unavailable loader results', async () => {
    loadCachedLiveJourney.mockResolvedValue({
      ok: false,
      dataSource: 'unavailable',
      error: 'Live journey not found for train',
      status: 404,
      code: 'NOT_FOUND',
    });
    const result = await detectJourneyNotificationEvents('12951');
    expect(result.skipped).toBe('unavailable');
    expect(result.events).toEqual([]);
  });

  it('skips fallback journeys from the loader', async () => {
    loadCachedLiveJourney.mockResolvedValue({
      ok: true,
      journey: journey(),
      dataSource: 'fallback',
      originSource: 'fallback',
      cached: false,
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const result = await detectJourneyNotificationEvents('12951');
    expect(result.skipped).toBe('fallback');
    expect(result.events).toEqual([]);
  });

  it('detects from a live loaded journey', async () => {
    loadCachedLiveJourney.mockResolvedValue({
      ok: true,
      journey: journey(),
      dataSource: 'live',
      originSource: 'live',
      cached: false,
    });
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const result = await detectJourneyNotificationEvents('12951');
    expect(result.skipped).toBeNull();
    expect(result.events[0]?.eventType).toBe('approaching_station');
  });
});
