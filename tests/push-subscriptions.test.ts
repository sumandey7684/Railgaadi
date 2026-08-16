import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getRedis = vi.fn();
const logRedisFailure = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => getRedis(),
  logRedisFailure: (...args: unknown[]) => logRedisFailure(...args),
}));

import {
  deletePushSubscription,
  listPushSubscriptionsForInstallation,
  notifyPushInstallKey,
  notifyPushKey,
  parsePushEndpoint,
  parsePushSubscriptionInput,
  pushEndpointHash,
  removeExpiredPushSubscription,
  resetPushSubscriptionMemoryForTests,
  upsertPushSubscription,
} from '@/lib/push-subscriptions';
import { NotificationStoreError } from '@/lib/notifications';
import { POST as postSubscribe, DELETE as deleteSubscribe } from '@/app/api/notifications/subscribe/route';
import { GET as getVapid } from '@/app/api/notifications/vapid/route';
import { isExpiredPushStatus, vapidPublicClientPayload, getConfiguredWebPush } from '@/lib/vapid';

const INSTALL = 'install-device-01';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/example-endpoint-key';
const SUB = {
  endpoint: ENDPOINT,
  keys: {
    p256dh: 'BNfakesubscriptionp256dhkeyvaluexx',
    auth: 'fakeauthkeyvalue1',
  },
};

describe('push subscription validation', () => {
  it('accepts https endpoints and hashes them', () => {
    expect(parsePushEndpoint(ENDPOINT)).toBe(ENDPOINT);
    expect(parsePushEndpoint('http://insecure.example/push')).toBeNull();
    expect(parsePushEndpoint('not-a-url')).toBeNull();
    expect(pushEndpointHash(ENDPOINT)).toMatch(/^[a-f0-9]{64}$/);
    expect(notifyPushKey('abc')).toBe('rg:notify:push:abc');
    expect(notifyPushInstallKey(INSTALL)).toBe(`rg:notify:push-install:${INSTALL}`);
  });

  it('rejects missing payloads', () => {
    expect(() => parsePushSubscriptionInput(null)).toThrow(NotificationStoreError);
    expect(() => parsePushSubscriptionInput({})).toThrow(NotificationStoreError);
    expect(() =>
      parsePushSubscriptionInput({ installationId: INSTALL, subscription: { endpoint: ENDPOINT } })
    ).toThrow(NotificationStoreError);
  });

  it('parses a valid body', () => {
    const parsed = parsePushSubscriptionInput({ installationId: INSTALL, subscription: SUB });
    expect(parsed.installationId).toBe(INSTALL);
    expect(parsed.endpoint).toBe(ENDPOINT);
    expect(parsed.keys.p256dh).toBe(SUB.keys.p256dh);
  });
});

describe('push subscription store', () => {
  beforeEach(() => {
    resetPushSubscriptionMemoryForTests();
    getRedis.mockReturnValue(null);
    logRedisFailure.mockReset();
  });

  it('stores a subscription against an installation', async () => {
    const result = await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    expect(result.updated).toBe(false);
    expect(result.installationId).toBe(INSTALL);

    const listed = await listPushSubscriptionsForInstallation(INSTALL);
    expect(listed).toHaveLength(1);
    expect(listed[0].endpoint).toBe(ENDPOINT);
    expect(listed[0].keys.auth).toBe(SUB.keys.auth);
  });

  it('upserts the same endpoint idempotently', async () => {
    await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    const second = await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: { ...SUB.keys, auth: 'rotatedauthkeyvalue' },
    });
    expect(second.updated).toBe(true);
    const listed = await listPushSubscriptionsForInstallation(INSTALL);
    expect(listed).toHaveLength(1);
    expect(listed[0].keys.auth).toBe('rotatedauthkeyvalue');
  });

  it('reassigns an endpoint to a new installation', async () => {
    await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    await upsertPushSubscription({
      installationId: 'install-device-02',
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);
    expect(await listPushSubscriptionsForInstallation('install-device-02')).toHaveLength(1);
  });

  it('deletes a subscription', async () => {
    await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    await deletePushSubscription({ installationId: INSTALL, endpoint: ENDPOINT });
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);
  });

  it('removes expired endpoints', async () => {
    await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    expect(isExpiredPushStatus(410)).toBe(true);
    expect(isExpiredPushStatus(200)).toBe(false);
    await expect(removeExpiredPushSubscription(ENDPOINT)).resolves.toBe(true);
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);
  });

  it('persists via Redis when configured', async () => {
    const store = new Map<string, unknown>();
    const sets = new Map<string, Set<string>>();
    getRedis.mockReturnValue({
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => store.delete(key)),
      sadd: vi.fn(async (key: string, member: string) => {
        if (!sets.has(key)) sets.set(key, new Set());
        sets.get(key)!.add(member);
        return 1;
      }),
      srem: vi.fn(async (key: string, member: string) => {
        sets.get(key)?.delete(member);
        return 1;
      }),
      smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    });

    const result = await upsertPushSubscription({
      installationId: INSTALL,
      endpoint: ENDPOINT,
      keys: SUB.keys,
    });
    expect(store.has(notifyPushKey(result.endpointHash))).toBe(true);
    expect(sets.get(notifyPushInstallKey(INSTALL))?.has(result.endpointHash)).toBe(true);
  });
});

describe('push API routes', () => {
  beforeEach(() => {
    resetPushSubscriptionMemoryForTests();
    getRedis.mockReturnValue(null);
  });

  it('POST stores a subscription', async () => {
    const res = await postSubscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({ installationId: INSTALL, subscription: SUB }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.installationId).toBe(INSTALL);
    expect(json.data.updated).toBe(false);
  });

  it('POST rejects invalid JSON and missing subscription', async () => {
    const badJson = await postSubscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(badJson.status).toBe(400);

    const missing = await postSubscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({ installationId: INSTALL }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(missing.status).toBe(400);
  });

  it('DELETE removes the subscription', async () => {
    await postSubscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({ installationId: INSTALL, subscription: SUB }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const res = await deleteSubscribe(
      new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ installationId: INSTALL, endpoint: ENDPOINT }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(200);
    expect(await listPushSubscriptionsForInstallation(INSTALL)).toHaveLength(0);
  });
});

describe('VAPID public/private separation', () => {
  it('public client payload contains only publicKey', () => {
    const payload = vapidPublicClientPayload();
    expect(Object.keys(payload)).toEqual(['publicKey']);
    expect(JSON.stringify(payload)).not.toMatch(/private/i);
  });

  it('GET /api/notifications/vapid never includes a privateKey field', async () => {
    const res = await getVapid();
    const json = await res.json();
    expect(json).not.toHaveProperty('privateKey');
    expect(json.data?.privateKey).toBeUndefined();
    const dump = JSON.stringify(json);
    expect(dump).not.toContain('VAPID_PRIVATE_KEY');
    expect(dump).not.toMatch(/"privateKey"/);
  });

  it('does not expose the VAPID private key via getConfiguredWebPush return surface', () => {
    const client = getConfiguredWebPush();
    if (client) {
      const dump = JSON.stringify(Object.keys(client));
      expect(dump).not.toContain('privateKey');
    }
    const payload = vapidPublicClientPayload();
    expect('privateKey' in payload).toBe(false);
  });

  it('treats 404/410 as expired push endpoints', () => {
    expect(isExpiredPushStatus(404)).toBe(true);
    expect(isExpiredPushStatus(410)).toBe(true);
    expect(isExpiredPushStatus(401)).toBe(false);
  });
});
