import { createHash } from 'node:crypto';
import { getRedis, logRedisFailure } from '@/lib/redis';
import { parseInstallationId, NotificationStoreError } from '@/lib/notifications';
import { NOTIFY_RULE_TTL_SECONDS, REDIS_NOTIFY_PREFIX } from '@/lib/notifications';
import type { PushSubscribeResult, StoredPushSubscription, UpsertPushSubscriptionInput } from '@/types/push';

export const PUSH_ENDPOINT_MAX_LEN = 2048;

const memoryByHash = new Map<string, StoredPushSubscription>();
const memoryByInstall = new Map<string, Set<string>>();

export function resetPushSubscriptionMemoryForTests() {
  memoryByHash.clear();
  memoryByInstall.clear();
}

export function pushEndpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export function notifyPushKey(endpointHash: string) {
  return `${REDIS_NOTIFY_PREFIX}push:${endpointHash}`;
}

export function notifyPushInstallKey(installationId: string) {
  return `${REDIS_NOTIFY_PREFIX}push-install:${installationId}`;
}

export function parsePushEndpoint(raw: string): string | null {
  const endpoint = raw.trim();
  if (endpoint.length < 12 || endpoint.length > PUSH_ENDPOINT_MAX_LEN) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    return endpoint;
  } catch {
    return null;
  }
}

function parsePushKey(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 512) {
    throw new NotificationStoreError('INVALID_RULE', `Invalid push subscription key: ${name}`);
  }
  return value.trim();
}

export function parsePushSubscriptionInput(body: unknown): UpsertPushSubscriptionInput {
  if (!body || typeof body !== 'object') {
    throw new NotificationStoreError('INVALID_RULE', 'Request body is required.');
  }
  const rec = body as Record<string, unknown>;
  const installationId = parseInstallationId(String(rec.installationId ?? ''));
  if (!installationId) {
    throw new NotificationStoreError(
      'INVALID_INSTALLATION_ID',
      'Invalid installation ID. Use 8–128 characters: letters, digits, underscore, or hyphen.'
    );
  }

  const sub = rec.subscription;
  if (!sub || typeof sub !== 'object') {
    throw new NotificationStoreError('INVALID_RULE', 'subscription object is required.');
  }
  const subRec = sub as Record<string, unknown>;
  const endpoint = parsePushEndpoint(String(subRec.endpoint ?? ''));
  if (!endpoint) {
    throw new NotificationStoreError(
      'INVALID_RULE',
      'Invalid push endpoint. Use an https URL from PushManager.subscribe().'
    );
  }
  const keys = subRec.keys;
  if (!keys || typeof keys !== 'object') {
    throw new NotificationStoreError('INVALID_RULE', 'subscription.keys is required.');
  }
  const keyRec = keys as Record<string, unknown>;

  return {
    installationId,
    endpoint,
    keys: {
      p256dh: parsePushKey(keyRec.p256dh, 'p256dh'),
      auth: parsePushKey(keyRec.auth, 'auth'),
    },
  };
}

function addInstallIndex(installationId: string, hash: string) {
  let set = memoryByInstall.get(installationId);
  if (!set) {
    set = new Set();
    memoryByInstall.set(installationId, set);
  }
  set.add(hash);
}

function removeInstallIndex(installationId: string, hash: string) {
  const set = memoryByInstall.get(installationId);
  if (!set) return;
  set.delete(hash);
  if (set.size === 0) memoryByInstall.delete(installationId);
}

async function redisGet(hash: string): Promise<StoredPushSubscription | null> {
  const redis = getRedis();
  if (!redis) return memoryByHash.get(hash) ?? null;
  try {
    const value = await redis.get<StoredPushSubscription>(notifyPushKey(hash));
    return value ?? memoryByHash.get(hash) ?? null;
  } catch (error) {
    logRedisFailure(`push get ${hash}`, error);
    return memoryByHash.get(hash) ?? null;
  }
}

async function redisSet(record: StoredPushSubscription, hash: string): Promise<void> {
  memoryByHash.set(hash, record);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(notifyPushKey(hash), record, { ex: NOTIFY_RULE_TTL_SECONDS });
  } catch (error) {
    logRedisFailure(`push set ${hash}`, error);
  }
}

async function redisDel(hash: string): Promise<void> {
  memoryByHash.delete(hash);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(notifyPushKey(hash));
  } catch (error) {
    logRedisFailure(`push del ${hash}`, error);
  }
}

async function redisSadd(install: string, hash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.sadd(notifyPushInstallKey(install), hash);
  } catch (error) {
    logRedisFailure('push sadd', error);
  }
}

async function redisSrem(install: string, hash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.srem(notifyPushInstallKey(install), hash);
  } catch (error) {
    logRedisFailure('push srem', error);
  }
}

async function redisSmembers(install: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const members = await redis.smembers(notifyPushInstallKey(install));
    return Array.isArray(members) ? members.map(String) : [];
  } catch (error) {
    logRedisFailure('push smembers', error);
    return [];
  }
}

/**
 * Idempotent upsert: same endpoint updates keys / installation association.
 * If the endpoint was tied to another installation, it is moved.
 */
export async function upsertPushSubscription(
  input: UpsertPushSubscriptionInput
): Promise<PushSubscribeResult> {
  const hash = pushEndpointHash(input.endpoint);
  const existing = await redisGet(hash);
  const now = new Date().toISOString();

  if (existing && existing.installationId !== input.installationId) {
    removeInstallIndex(existing.installationId, hash);
    await redisSrem(existing.installationId, hash);
  }

  const updated = Boolean(existing);
  const record: StoredPushSubscription = {
    installationId: input.installationId,
    endpoint: input.endpoint,
    keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await redisSet(record, hash);
  addInstallIndex(input.installationId, hash);
  await redisSadd(input.installationId, hash);

  return { installationId: input.installationId, endpointHash: hash, updated };
}

export async function listPushSubscriptionsForInstallation(
  installationId: string
): Promise<StoredPushSubscription[]> {
  const install = parseInstallationId(installationId);
  if (!install) {
    throw new NotificationStoreError(
      'INVALID_INSTALLATION_ID',
      'Invalid installation ID. Use 8–128 characters: letters, digits, underscore, or hyphen.'
    );
  }

  const ids = new Set([
    ...(await redisSmembers(install)),
    ...(memoryByInstall.get(install) ?? []),
  ]);

  const out: StoredPushSubscription[] = [];
  for (const hash of ids) {
    const rec = await redisGet(hash);
    if (rec && rec.installationId === install) out.push(rec);
  }
  return out;
}

export async function deletePushSubscription(input: {
  installationId: string;
  endpoint: string;
}): Promise<void> {
  const install = parseInstallationId(input.installationId);
  if (!install) {
    throw new NotificationStoreError(
      'INVALID_INSTALLATION_ID',
      'Invalid installation ID. Use 8–128 characters: letters, digits, underscore, or hyphen.'
    );
  }
  const endpoint = parsePushEndpoint(input.endpoint);
  if (!endpoint) {
    throw new NotificationStoreError('INVALID_RULE', 'Invalid push endpoint.');
  }

  const hash = pushEndpointHash(endpoint);
  const existing = await redisGet(hash);
  if (!existing) {
    throw new NotificationStoreError('NOT_FOUND', 'Push subscription not found.');
  }
  if (existing.installationId !== install) {
    throw new NotificationStoreError('NOT_FOUND', 'Push subscription not found.');
  }

  removeInstallIndex(install, hash);
  await redisSrem(install, hash);
  await redisDel(hash);
}

/** Drop a subscription after a 404/410 from the push service (Phase 3 send path). */
export async function removeExpiredPushSubscription(endpoint: string): Promise<boolean> {
  const parsed = parsePushEndpoint(endpoint);
  if (!parsed) return false;
  const hash = pushEndpointHash(parsed);
  const existing = await redisGet(hash);
  if (!existing) return false;
  removeInstallIndex(existing.installationId, hash);
  await redisSrem(existing.installationId, hash);
  await redisDel(hash);
  return true;
}
