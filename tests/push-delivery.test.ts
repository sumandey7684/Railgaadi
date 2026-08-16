import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import type { DetectedNotificationEvent, JourneyEventDetectionResult } from '@/lib/notification-events';
import {
  resetPushSubscriptionMemoryForTests,
  upsertPushSubscription,
  listPushSubscriptionsForInstallation,
} from '@/lib/push-subscriptions';
import { buildPushPayload, trainNotificationUrl } from '@/lib/push-payload';
import { deliverDetectedNotificationEvent, deliverDetectedNotificationEvents } from '@/lib/push-delivery';
import { vapidPublicClientPayload } from '@/lib/vapid';
import { GET as getVapid } from '@/app/api/notifications/vapid/route';
import type { StoredPushSubscription } from '@/types/push';

const INSTALL = 'install-device-01';
const EP_A = 'https://fcm.googleapis.com/fcm/send/endpoint-aaa-key';
const EP_B = 'https://fcm.googleapis.com/fcm/send/endpoint-bbb-key';
const KEYS = { p256dh: 'BNfakesubscriptionp256dhkeyvaluexx', auth: 'fakeauthkeyvalue1' };

function event(over: Partial<DetectedNotificationEvent> = {}): DetectedNotificationEvent {
  return {
    ruleId: 'rule-1',
    installationId: INSTALL,
    trainId: '12951',
    eventType: 'approaching_station',
    marker: 'approaching:KOTA',
    stationCode: 'KOTA',
    snapshot: { trainId: '12951', status: 'running', nextHaltCode: 'KOTA' },
    detectedAt: '2026-01-01T12:00:00.000Z',
    ...over,
  };
}

function detection(
  events: DetectedNotificationEvent[],
  skipped: JourneyEventDetectionResult['skipped'] = null
): JourneyEventDetectionResult {
  return {
    trainId: '12951',
    skipped,
    dataSource: skipped ? 'fallback' : 'live',
    events,
    observedRuleIds: [],
    suppressedDuplicateRuleIds: [],
  };
}

describe('push payload', () => {
  it('includes title, body, trainId, eventType, ruleId, timestamp, and train URL', () => {
    const payload = buildPushPayload(event());
    expect(payload.title).toBe('Approaching station');
    expect(payload.body).toContain('12951');
    expect(payload.body).toContain('KOTA');
    expect(payload.trainId).toBe('12951');
    expect(payload.eventType).toBe('approaching_station');
    expect(payload.stationCode).toBe('KOTA');
    expect(payload.ruleId).toBe('rule-1');
    expect(payload.timestamp).toBe('2026-01-01T12:00:00.000Z');
    expect(payload.url).toBe('/train/12951');
    expect(trainNotificationUrl('12951')).toBe('/train/12951');
  });
});

describe('push delivery', () => {
  beforeEach(() => {
    resetPushSubscriptionMemoryForTests();
    getRedis.mockReturnValue(null);
    logRedisFailure.mockReset();
  });

  it('sends to a stored subscription', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    const sender = vi.fn().mockResolvedValue({ statusCode: 201 });
    const result = await deliverDetectedNotificationEvent(event(), { sender });
    expect(sender).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sender.mock.calls[0][1]).url).toBe('/train/12951');
    expect(result.deliveries[0].outcome).toBe('sent');
  });

  it('sends to multiple subscriptions', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_B, keys: KEYS });
    const sender = vi.fn().mockResolvedValue({ statusCode: 201 });
    const result = await deliverDetectedNotificationEvent(event(), { sender });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(result.deliveries.every((d) => d.outcome === 'sent')).toBe(true);
  });

  it('removes expired 404/410 subscriptions', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    const sender = vi.fn().mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const result = await deliverDetectedNotificationEvent(event(), { sender });
    expect(result.deliveries[0].outcome).toBe('expired');
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);

    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_B, keys: KEYS });
    const sender404 = vi.fn().mockResolvedValue({ statusCode: 404 });
    const gone = await deliverDetectedNotificationEvent(event(), { sender: sender404 });
    expect(gone.deliveries[0].outcome).toBe('expired');
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);
  });

  it('treats 429 as retryable and keeps the subscription', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    const sender = vi.fn().mockRejectedValue(Object.assign(new Error('Slow down'), { statusCode: 429 }));
    const report = await deliverDetectedNotificationEvents(detection([event()]), { sender });
    expect(report.retryable).toBe(1);
    expect(report.events[0].deliveries[0].outcome).toBe('retryable');
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(1);
  });

  it('records other 4xx/5xx as failed without deleting', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    const sender = vi.fn().mockRejectedValue(Object.assign(new Error('Server'), { statusCode: 500 }));
    const result = await deliverDetectedNotificationEvent(event(), { sender });
    expect(result.deliveries[0].outcome).toBe('failed');
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(1);
  });

  it('does not send malformed subscription data', async () => {
    const bad: StoredPushSubscription = {
      installationId: INSTALL,
      endpoint: 'not-https',
      keys: { p256dh: 'x', auth: 'y' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sender = vi.fn();
    const result = await deliverDetectedNotificationEvent(event(), { sender, subscriptions: [bad] });
    expect(sender).not.toHaveBeenCalled();
    expect(result.deliveries[0].outcome).toBe('failed');
    expect(result.deliveries[0].error).toMatch(/Malformed/);
  });

  it('continues remaining subscriptions after one failure', async () => {
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_A, keys: KEYS });
    await upsertPushSubscription({ installationId: INSTALL, endpoint: EP_B, keys: KEYS });
    const sender = vi.fn().mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === EP_A) {
        throw Object.assign(new Error('fail A'), { statusCode: 500 });
      }
      return { statusCode: 201 };
    });
    const report = await deliverDetectedNotificationEvents(detection([event()]), { sender });
    expect(report.failed).toBe(1);
    expect(report.sent).toBe(1);
  });

  it('does not deliver fallback or unavailable detection results', async () => {
    const sender = vi.fn();
    const fallback = await deliverDetectedNotificationEvents(detection([event()], 'fallback'), { sender });
    const unavailable = await deliverDetectedNotificationEvents(detection([event()], 'unavailable'), {
      sender,
    });
    expect(sender).not.toHaveBeenCalled();
    expect(fallback.skipped).toBe('fallback');
    expect(unavailable.skipped).toBe('unavailable');
    expect(fallback.sent).toBe(0);
  });
});

describe('VAPID remains server-only', () => {
  it('public payload and vapid GET omit privateKey', async () => {
    expect(Object.keys(vapidPublicClientPayload())).toEqual(['publicKey']);
    const json = await (await getVapid()).json();
    expect(JSON.stringify(json)).not.toMatch(/"privateKey"/);
  });

  it('push-client source does not import vapid private helpers', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/push-client.ts'), 'utf8');
    expect(src).not.toContain('VAPID_PRIVATE_KEY');
    expect(src).not.toContain('getConfiguredWebPush');
  });

  it('service worker opens the train page URL from payload data', () => {
    const sw = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(sw).toContain('notificationclick');
    expect(sw).toContain('data.url');
    expect(sw).toContain('/train/');
  });
});
