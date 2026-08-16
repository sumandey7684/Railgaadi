import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveJourney, Station } from '@/types/train';
import type { NotificationRule } from '@/types/notifications';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import {
  NOTIFICATION_PRODUCTION_REQUIRES_REDIS,
  NotificationStoreError,
  REDIS_NOTIFY_PREFIX,
  computeRuleObservation,
  createNotificationRule,
  deleteNotificationRule,
  disableNotificationRule,
  getNotificationRule,
  isActiveEventMarker,
  journeyNotifySnapshot,
  listActiveRulesForTrain,
  listRulesForInstallation,
  markNotificationObserved,
  markNotificationTriggered,
  notifyInstallKey,
  notifyRuleKey,
  notifyTrainKey,
  notifyUniqueKey,
  observationMarker,
  parseInstallationId,
  resetNotificationMemoryForTests,
  updateNotificationRule,
} from '@/lib/notifications';

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

describe('notification keys', () => {
  it('uses the rg:notify: namespace', () => {
    expect(notifyRuleKey('abc')).toBe('rg:notify:rule:abc');
    expect(notifyInstallKey(INSTALL)).toBe(`rg:notify:install:${INSTALL}`);
    expect(notifyTrainKey('12951')).toBe('rg:notify:train:12951');
    expect(REDIS_NOTIFY_PREFIX).toBe('rg:notify:');
    expect(notifyUniqueKey({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
      stationCode: 'NDLS',
    })).toBe(`rg:notify:unique:${INSTALL}:12951:approaching_station:NDLS:`);
    expect(notifyUniqueKey({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'delay_threshold',
      delayThresholdMinutes: 15,
    })).toBe(`rg:notify:unique:${INSTALL}:12951:delay_threshold::15`);
    expect(NOTIFICATION_PRODUCTION_REQUIRES_REDIS).toMatch(/Upstash Redis/);
  });
});

describe('notification validation', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    getRedis.mockReturnValue(null);
    logRedisFailure.mockReset();
  });

  it('parses installation ids', () => {
    expect(parseInstallationId('short')).toBeNull();
    expect(parseInstallationId(INSTALL)).toBe(INSTALL);
  });

  it('rejects invalid train IDs', async () => {
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: 'abc',
        eventType: 'journey_completed',
      })
    ).rejects.toMatchObject({ code: 'INVALID_TRAIN_ID' });
  });

  it('rejects invalid installation IDs', async () => {
    await expect(
      createNotificationRule({
        installationId: 'x',
        trainId: '12951',
        eventType: 'journey_completed',
      })
    ).rejects.toMatchObject({ code: 'INVALID_INSTALLATION_ID' });
  });

  it('requires delayThresholdMinutes for delay_threshold', async () => {
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'delay_threshold',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RULE' });
  });

  it('rejects delayThresholdMinutes on other event types', async () => {
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'journey_completed',
        delayThresholdMinutes: 10,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RULE' });
  });

  it('rejects malformed station codes', async () => {
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'station_arrived',
        stationCode: 'nope!',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RULE' });
  });
});

describe('notification CRUD (memory)', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    getRedis.mockReturnValue(null);
  });

  it('creates, lists, and fetches a rule', async () => {
    const created = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
      stationCode: 'kota',
    });
    expect(created.trainId).toBe('12951');
    expect(created.stationCode).toBe('KOTA');
    expect(created.enabled).toBe(true);
    expect(created.lastTriggeredAt).toBeUndefined();

    const listed = await listRulesForInstallation(INSTALL);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    await expect(getNotificationRule(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it('prevents duplicate identity', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'delay_threshold',
      delayThresholdMinutes: 20,
    });
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'delay_threshold',
        delayThresholdMinutes: 20,
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_RULE' });
  });

  it('allows the same event with a different station', async () => {
    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_arrived',
      stationCode: 'NDLS',
    });
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'station_arrived',
        stationCode: 'MMCT',
      })
    ).resolves.toMatchObject({ stationCode: 'MMCT' });
  });

  it('lists only enabled rules for a train', async () => {
    const a = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'journey_completed',
    });
    const b = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12952',
      eventType: 'journey_completed',
    });
    await disableNotificationRule(a.id);

    const for12951 = await listActiveRulesForTrain('12951');
    expect(for12951.map((r) => r.id)).toEqual([]);
    const for12952 = await listActiveRulesForTrain('12952');
    expect(for12952.map((r) => r.id)).toEqual([b.id]);
  });

  it('updates delay threshold and reindexes uniqueness', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'delay_threshold',
      delayThresholdMinutes: 10,
    });
    const updated = await updateNotificationRule(rule.id, { delayThresholdMinutes: 30 });
    expect(updated.delayThresholdMinutes).toBe(30);

    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'delay_threshold',
        delayThresholdMinutes: 10,
      })
    ).resolves.toBeTruthy();
  });

  it('deletes a rule', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'station_departed',
    });
    await deleteNotificationRule(rule.id);
    await expect(getNotificationRule(rule.id)).resolves.toBeNull();
    await expect(listRulesForInstallation(INSTALL)).resolves.toEqual([]);
    await expect(listActiveRulesForTrain('12951')).resolves.toEqual([]);
  });

  it('marks triggered and observed markers', async () => {
    const rule = await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'approaching_station',
    });
    const observed = await markNotificationObserved(rule.id, 'idle:approaching');
    expect(observed.lastTriggeredAt).toBeUndefined();
    expect(observed.lastObservedMarker).toBe('idle:approaching');

    const fired = await markNotificationTriggered(rule.id, 'approaching:KOTA');
    expect(fired.lastObservedMarker).toBe('approaching:KOTA');
    expect(fired.lastTriggeredAt).toBeTruthy();
  });

  it('returns NOT_FOUND for missing updates', async () => {
    await expect(updateNotificationRule('missing', { enabled: false })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('event-rule matching', () => {
  const baseRule = (over: Partial<NotificationRule> = {}): NotificationRule => ({
    id: 'r1',
    installationId: INSTALL,
    trainId: '12951',
    eventType: 'approaching_station',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('builds a snapshot from journey-state helpers', () => {
    const snap = journeyNotifySnapshot(journey());
    expect(snap.currentHaltCode).toBe('BRC');
    expect(snap.previousHaltCode).toBe('ST');
    expect(snap.nextHaltCode).toBe('KOTA');
  });

  it('matches approaching / arrived / departed with optional station filter', () => {
    const snap = journeyNotifySnapshot(journey());
    expect(observationMarker(baseRule({ eventType: 'approaching_station' }), snap)).toBe(
      'approaching:KOTA'
    );
    expect(
      observationMarker(baseRule({ eventType: 'approaching_station', stationCode: 'NDLS' }), snap)
    ).toBe('idle:approaching');
    expect(observationMarker(baseRule({ eventType: 'station_arrived' }), snap)).toBe('arrived:BRC');
    expect(observationMarker(baseRule({ eventType: 'station_departed', stationCode: 'ST' }), snap)).toBe(
      'departed:ST'
    );
    expect(isActiveEventMarker('approaching:KOTA')).toBe(true);
    expect(isActiveEventMarker('idle:approaching')).toBe(false);
  });

  it('dedupes the same approaching marker', () => {
    const snap = journeyNotifySnapshot(journey());
    const rule = baseRule({ eventType: 'approaching_station' });
    const first = computeRuleObservation(rule, snap);
    expect(first.shouldTrigger).toBe(true);
    const second = computeRuleObservation({ ...rule, lastObservedMarker: first.marker }, snap);
    expect(second.shouldTrigger).toBe(false);
  });

  it('fires delay_threshold once until delay drops below the threshold', () => {
    const rule = baseRule({ eventType: 'delay_threshold', delayThresholdMinutes: 10 });
    const late = computeRuleObservation(rule, journeyNotifySnapshot(journey({ delayMinutes: 12 })));
    expect(late.marker).toBe('delay:active:10');
    expect(late.shouldTrigger).toBe(true);

    const stillLate = computeRuleObservation(
      { ...rule, lastObservedMarker: late.marker },
      journeyNotifySnapshot(journey({ delayMinutes: 40 }))
    );
    expect(stillLate.shouldTrigger).toBe(false);

    const recovered = computeRuleObservation(
      { ...rule, lastObservedMarker: late.marker },
      journeyNotifySnapshot(journey({ delayMinutes: 2 }))
    );
    expect(recovered.marker).toBe('delay:idle:10');
    expect(recovered.shouldTrigger).toBe(false);

    const lateAgain = computeRuleObservation(
      { ...rule, lastObservedMarker: recovered.marker },
      journeyNotifySnapshot(journey({ delayMinutes: 11 }))
    );
    expect(lateAgain.shouldTrigger).toBe(true);
  });

  it('does not fire next_station_changed on the first observation', () => {
    const rule = baseRule({ eventType: 'next_station_changed' });
    const snap = journeyNotifySnapshot(journey());
    const first = computeRuleObservation(rule, snap);
    expect(first.shouldTrigger).toBe(false);
    expect(first.marker).toBe('next:KOTA');

    const changed = computeRuleObservation(
      { ...rule, lastObservedMarker: first.marker },
      journeyNotifySnapshot(
        journey({
          nextHalt: halt({ code: 'NDLS', name: 'Delhi', status: 'upcoming' }),
          nextStation: halt({ code: 'NDLS', name: 'Delhi', status: 'upcoming' }),
        })
      )
    );
    expect(changed.shouldTrigger).toBe(true);
    expect(changed.marker).toBe('next:NDLS');
  });

  it('matches journey_completed', () => {
    const rule = baseRule({ eventType: 'journey_completed' });
    const running = computeRuleObservation(rule, journeyNotifySnapshot(journey()));
    expect(running.shouldTrigger).toBe(false);
    const done = computeRuleObservation(
      { ...rule, lastObservedMarker: running.marker },
      journeyNotifySnapshot(journey({ status: 'completed' }))
    );
    expect(done.shouldTrigger).toBe(true);
    expect(done.marker).toBe('completed');
  });
});

describe('notification Redis NX duplicate', () => {
  beforeEach(() => {
    resetNotificationMemoryForTests();
    getRedis.mockReset();
    logRedisFailure.mockReset();
  });

  it('honours Redis SET NX rejection', async () => {
    const store = new Map<string, unknown>();
    getRedis.mockReturnValue({
      set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => store.delete(key)),
      sadd: vi.fn(async () => 1),
      srem: vi.fn(async () => 1),
      smembers: vi.fn(async () => []),
    });

    await createNotificationRule({
      installationId: INSTALL,
      trainId: '12951',
      eventType: 'journey_completed',
    });
    resetNotificationMemoryForTests();
    await expect(
      createNotificationRule({
        installationId: INSTALL,
        trainId: '12951',
        eventType: 'journey_completed',
      })
    ).rejects.toBeInstanceOf(NotificationStoreError);
  });
});
