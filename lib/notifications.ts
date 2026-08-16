import { randomUUID } from 'node:crypto';
import { getRedis, logRedisFailure } from '@/lib/redis';
import { INVALID_TRAIN_ID_ERROR, parseTrainId } from '@/lib/train-id';
import { currentHalt, nextHalt, previousHalt } from '@/lib/journey-state';
import type { LiveJourney } from '@/types/train';
import type {
  CreateNotificationRuleInput,
  JourneyNotifySnapshot,
  NotificationEventType,
  NotificationRule,
  UpdateNotificationRuleInput,
} from '@/types/notifications';
import { NOTIFICATION_EVENT_TYPES } from '@/types/notifications';

export const REDIS_NOTIFY_PREFIX = 'rg:notify:';
export const NOTIFY_RULE_TTL_SECONDS = 60 * 60 * 24 * 45; // 45 days sliding on write

export const NOTIFICATION_PRODUCTION_REQUIRES_REDIS =
  'Durable notification rules require Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Memory fallback is process-local and ephemeral.';

const INSTALL_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const STATION_CODE_RE = /^[A-Z0-9]{2,10}$/;

export type NotificationStoreErrorCode =
  | 'INVALID_TRAIN_ID'
  | 'INVALID_INSTALLATION_ID'
  | 'INVALID_RULE'
  | 'DUPLICATE_RULE'
  | 'NOT_FOUND';

export class NotificationStoreError extends Error {
  readonly code: NotificationStoreErrorCode;

  constructor(code: NotificationStoreErrorCode, message: string) {
    super(message);
    this.name = 'NotificationStoreError';
    this.code = code;
  }
}

export function notifyRuleKey(ruleId: string) {
  return `${REDIS_NOTIFY_PREFIX}rule:${ruleId}`;
}

export function notifyInstallKey(installationId: string) {
  return `${REDIS_NOTIFY_PREFIX}install:${installationId}`;
}

export function notifyTrainKey(trainId: string) {
  return `${REDIS_NOTIFY_PREFIX}train:${trainId}`;
}

export function notifyUniqueKey(parts: {
  installationId: string;
  trainId: string;
  eventType: NotificationEventType;
  stationCode?: string;
  delayThresholdMinutes?: number;
}) {
  const station = parts.stationCode ?? '';
  const delay =
    parts.eventType === 'delay_threshold' ? String(parts.delayThresholdMinutes ?? '') : '';
  return `${REDIS_NOTIFY_PREFIX}unique:${parts.installationId}:${parts.trainId}:${parts.eventType}:${station}:${delay}`;
}

// ─── Process-local fallback (tests + Redis-unset / Redis-error) ────────────

interface MemoryStore {
  rules: Map<string, NotificationRule>;
  unique: Map<string, string>;
  byInstall: Map<string, Set<string>>;
  byTrain: Map<string, Set<string>>;
}

const memory: MemoryStore = {
  rules: new Map(),
  unique: new Map(),
  byInstall: new Map(),
  byTrain: new Map(),
};

export function resetNotificationMemoryForTests() {
  memory.rules.clear();
  memory.unique.clear();
  memory.byInstall.clear();
  memory.byTrain.clear();
}

function addToIndex(map: Map<string, Set<string>>, key: string, ruleId: string) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(ruleId);
}

function removeFromIndex(map: Map<string, Set<string>>, key: string, ruleId: string) {
  const set = map.get(key);
  if (!set) return;
  set.delete(ruleId);
  if (set.size === 0) map.delete(key);
}

// ─── Validation ────────────────────────────────────────────────────────────

export function isNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

export function parseInstallationId(raw: string): string | null {
  const id = raw.trim();
  if (!INSTALL_ID_RE.test(id)) return null;
  return id;
}

export function parseStationCode(raw: string | undefined | null): string | undefined {
  if (raw == null || raw === '') return undefined;
  const code = raw.trim().toUpperCase();
  if (!STATION_CODE_RE.test(code)) {
    throw new NotificationStoreError(
      'INVALID_RULE',
      'Invalid station code. Use 2–10 letters or digits (e.g. NDLS).'
    );
  }
  return code;
}

function assertEventFields(
  eventType: NotificationEventType,
  delayThresholdMinutes: number | undefined
) {
  if (eventType === 'delay_threshold') {
    if (
      delayThresholdMinutes == null ||
      !Number.isFinite(delayThresholdMinutes) ||
      delayThresholdMinutes < 1 ||
      delayThresholdMinutes > 24 * 60
    ) {
      throw new NotificationStoreError(
        'INVALID_RULE',
        'delay_threshold requires delayThresholdMinutes between 1 and 1440.'
      );
    }
  } else if (delayThresholdMinutes != null) {
    throw new NotificationStoreError(
      'INVALID_RULE',
      'delayThresholdMinutes is only valid for delay_threshold rules.'
    );
  }
}

function normalizeCreateInput(input: CreateNotificationRuleInput): {
  installationId: string;
  trainId: string;
  eventType: NotificationEventType;
  stationCode?: string;
  delayThresholdMinutes?: number;
  enabled: boolean;
} {
  const installationId = parseInstallationId(input.installationId);
  if (!installationId) {
    throw new NotificationStoreError(
      'INVALID_INSTALLATION_ID',
      'Invalid installation ID. Use 8–128 characters: letters, digits, underscore, or hyphen.'
    );
  }

  const trainId = parseTrainId(input.trainId);
  if (!trainId) {
    throw new NotificationStoreError('INVALID_TRAIN_ID', INVALID_TRAIN_ID_ERROR);
  }

  if (!isNotificationEventType(input.eventType)) {
    throw new NotificationStoreError('INVALID_RULE', 'Unknown notification event type.');
  }

  if (input.eventType !== 'delay_threshold' && input.delayThresholdMinutes != null) {
    throw new NotificationStoreError(
      'INVALID_RULE',
      'delayThresholdMinutes is only valid for delay_threshold rules.'
    );
  }

  const delayThresholdMinutes =
    input.eventType === 'delay_threshold' ? Math.floor(Number(input.delayThresholdMinutes)) : undefined;
  assertEventFields(input.eventType, delayThresholdMinutes);

  const stationCode = parseStationCode(input.stationCode);
  const enabled = input.enabled !== false;

  return {
    installationId,
    trainId,
    eventType: input.eventType,
    stationCode,
    delayThresholdMinutes,
    enabled,
  };
}

// ─── Journey snapshot / matching ───────────────────────────────────────────

export function journeyNotifySnapshot(journey: LiveJourney): JourneyNotifySnapshot {
  return {
    trainId: journey.trainId || journey.number,
    status: journey.status,
    delayMinutes: journey.delayMinutes,
    currentHaltCode: currentHalt(journey)?.code,
    previousHaltCode: previousHalt(journey)?.code,
    nextHaltCode: nextHalt(journey)?.code,
  };
}

function stationMatches(ruleStation: string | undefined, code: string | undefined): code is string {
  if (!code) return false;
  if (!ruleStation) return true;
  return ruleStation === code;
}

export function observationMarker(
  rule: Pick<NotificationRule, 'eventType' | 'stationCode' | 'delayThresholdMinutes'>,
  snapshot: JourneyNotifySnapshot
): string {
  switch (rule.eventType) {
    case 'approaching_station': {
      const code = snapshot.nextHaltCode;
      if (stationMatches(rule.stationCode, code)) return `approaching:${code}`;
      return 'idle:approaching';
    }
    case 'station_arrived': {
      const code = snapshot.currentHaltCode;
      if (stationMatches(rule.stationCode, code)) return `arrived:${code}`;
      return 'idle:arrived';
    }
    case 'station_departed': {
      const code = snapshot.previousHaltCode;
      if (stationMatches(rule.stationCode, code)) return `departed:${code}`;
      return 'idle:departed';
    }
    case 'delay_threshold': {
      const th = rule.delayThresholdMinutes ?? 0;
      const delay = snapshot.delayMinutes;
      if (delay != null && delay >= th) return `delay:active:${th}`;
      return `delay:idle:${th}`;
    }
    case 'next_station_changed':
      return `next:${snapshot.nextHaltCode || 'none'}`;
    case 'journey_completed':
      return snapshot.status === 'completed' ? 'completed' : 'idle:completed';
    default:
      return 'idle';
  }
}

export function isActiveEventMarker(marker: string): boolean {
  return !marker.startsWith('idle:') && !marker.includes(':idle:');
}

/**
 * Dedup: trigger when the observation marker is an active event and differs
 * from lastObservedMarker. `next_station_changed` does not fire on the first
 * observation (needs a previous marker to detect a change).
 */
export function computeRuleObservation(
  rule: NotificationRule,
  snapshot: JourneyNotifySnapshot
): { marker: string; shouldTrigger: boolean } {
  const marker = observationMarker(rule, snapshot);
  const prev = rule.lastObservedMarker;

  if (rule.eventType === 'next_station_changed') {
    const shouldTrigger = Boolean(prev) && prev !== marker;
    return { marker, shouldTrigger };
  }

  const shouldTrigger = isActiveEventMarker(marker) && marker !== prev;
  return { marker, shouldTrigger };
}

// ─── Redis helpers ─────────────────────────────────────────────────────────

async function redisGetRule(id: string): Promise<NotificationRule | null> {
  const redis = getRedis();
  if (!redis) return memory.rules.get(id) ?? null;
  try {
    const value = await redis.get<NotificationRule>(notifyRuleKey(id));
    return value ?? null;
  } catch (error) {
    logRedisFailure(`notify get ${id}`, error);
    return memory.rules.get(id) ?? null;
  }
}

async function redisSetRule(rule: NotificationRule): Promise<void> {
  memory.rules.set(rule.id, rule);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(notifyRuleKey(rule.id), rule, { ex: NOTIFY_RULE_TTL_SECONDS });
  } catch (error) {
    logRedisFailure(`notify set ${rule.id}`, error);
  }
}

export const NOTIFY_EVENT_FIRE_TTL_SECONDS = 60;

export function notifyEventFireKey(ruleId: string, marker: string) {
  return `${REDIS_NOTIFY_PREFIX}fired:${ruleId}:${marker}`;
}

async function redisClaimNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (memory.unique.has(key)) return false;
  memory.unique.set(key, value);

  const redis = getRedis();
  if (!redis) return true;
  try {
    const ok = await redis.set(key, value, { nx: true, ex: ttlSeconds });
    if (!ok) {
      memory.unique.delete(key);
      return false;
    }
    return true;
  } catch (error) {
    logRedisFailure('notify unique NX', error);
    return true;
  }
}

async function redisClaimUnique(key: string, ruleId: string): Promise<boolean> {
  return redisClaimNx(key, ruleId, NOTIFY_RULE_TTL_SECONDS);
}

/** SET NX so concurrent detectors cannot emit the same rule+marker twice. */
export async function claimNotificationEventFire(ruleId: string, marker: string): Promise<boolean> {
  return redisClaimNx(notifyEventFireKey(ruleId, marker), '1', NOTIFY_EVENT_FIRE_TTL_SECONDS);
}

/** Release a fire claim after the rule returns to idle so delay can re-cross. */
export async function releaseNotificationEventFire(ruleId: string, marker: string): Promise<void> {
  await redisReleaseUnique(notifyEventFireKey(ruleId, marker));
}

async function redisReleaseUnique(key: string): Promise<void> {
  memory.unique.delete(key);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    logRedisFailure('notify unique del', error);
  }
}

async function redisSadd(key: string, member: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.sadd(key, member);
  } catch (error) {
    logRedisFailure(`notify sadd ${key}`, error);
  }
}

async function redisSrem(key: string, member: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.srem(key, member);
  } catch (error) {
    logRedisFailure(`notify srem ${key}`, error);
  }
}

async function redisSmembers(key: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const members = await redis.smembers(key);
    return Array.isArray(members) ? members.map(String) : [];
  } catch (error) {
    logRedisFailure(`notify smembers ${key}`, error);
    return [];
  }
}

async function redisDelRule(id: string): Promise<void> {
  memory.rules.delete(id);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(notifyRuleKey(id));
  } catch (error) {
    logRedisFailure(`notify del ${id}`, error);
  }
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function createNotificationRule(
  input: CreateNotificationRuleInput
): Promise<NotificationRule> {
  const normalized = normalizeCreateInput(input);
  const uniqueKey = notifyUniqueKey(normalized);
  const id = randomUUID();

  const claimed = await redisClaimUnique(uniqueKey, id);
  if (!claimed) {
    throw new NotificationStoreError(
      'DUPLICATE_RULE',
      'A matching notification rule already exists for this installation.'
    );
  }

  const rule: NotificationRule = {
    id,
    installationId: normalized.installationId,
    trainId: normalized.trainId,
    eventType: normalized.eventType,
    enabled: normalized.enabled,
    createdAt: new Date().toISOString(),
  };
  if (normalized.stationCode) rule.stationCode = normalized.stationCode;
  if (normalized.delayThresholdMinutes != null) {
    rule.delayThresholdMinutes = normalized.delayThresholdMinutes;
  }

  await redisSetRule(rule);
  addToIndex(memory.byInstall, rule.installationId, rule.id);
  await redisSadd(notifyInstallKey(rule.installationId), rule.id);
  if (rule.enabled) {
    addToIndex(memory.byTrain, rule.trainId, rule.id);
    await redisSadd(notifyTrainKey(rule.trainId), rule.id);
  }

  return rule;
}

export async function getNotificationRule(ruleId: string): Promise<NotificationRule | null> {
  const id = ruleId.trim();
  if (!id) return null;
  return redisGetRule(id);
}

export async function listRulesForInstallation(installationId: string): Promise<NotificationRule[]> {
  const install = parseInstallationId(installationId);
  if (!install) {
    throw new NotificationStoreError(
      'INVALID_INSTALLATION_ID',
      'Invalid installation ID. Use 8–128 characters: letters, digits, underscore, or hyphen.'
    );
  }

  const redisIds = await redisSmembers(notifyInstallKey(install));
  const memIds = [...(memory.byInstall.get(install) ?? [])];
  const ids = new Set([...redisIds, ...memIds]);

  const rules: NotificationRule[] = [];
  for (const id of ids) {
    const rule = await redisGetRule(id);
    if (rule) rules.push(rule);
  }
  return rules.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listActiveRulesForTrain(trainId: string): Promise<NotificationRule[]> {
  const id = parseTrainId(trainId);
  if (!id) {
    throw new NotificationStoreError('INVALID_TRAIN_ID', INVALID_TRAIN_ID_ERROR);
  }

  const redisIds = await redisSmembers(notifyTrainKey(id));
  const memIds = [...(memory.byTrain.get(id) ?? [])];
  const ids = new Set([...redisIds, ...memIds]);

  const rules: NotificationRule[] = [];
  for (const ruleId of ids) {
    const rule = await redisGetRule(ruleId);
    if (rule?.enabled && rule.trainId === id) rules.push(rule);
  }
  return rules;
}

/**
 * Train IDs that currently have at least one enabled rule.
 * Read-only index walk — does not change CRUD semantics.
 */
export async function listTrainIdsWithActiveRules(): Promise<string[]> {
  const ids = new Set<string>();
  for (const [trainId, ruleIds] of memory.byTrain) {
    if (ruleIds.size > 0) ids.add(trainId);
  }

  const redis = getRedis();
  if (redis) {
    try {
      let cursor: number | string = 0;
      const match = `${REDIS_NOTIFY_PREFIX}train:*`;
      do {
        const reply = (await redis.scan(cursor, { match, count: 100 })) as [string | number, string[]];
        const next: string | number = reply[0];
        const keys: string[] = reply[1] ?? [];
        cursor = next;
        for (const key of keys) {
          const trainId = String(key).slice(`${REDIS_NOTIFY_PREFIX}train:`.length);
          if (parseTrainId(trainId)) ids.add(trainId);
        }
      } while (String(cursor) !== '0');
    } catch (error) {
      logRedisFailure('notify scan train index', error);
    }
  }

  return [...ids].sort();
}

export async function disableNotificationRule(ruleId: string): Promise<NotificationRule> {
  return updateNotificationRule(ruleId, { enabled: false });
}

export async function deleteNotificationRule(ruleId: string): Promise<void> {
  const rule = await redisGetRule(ruleId.trim());
  if (!rule) {
    throw new NotificationStoreError('NOT_FOUND', 'Notification rule not found.');
  }

  const uniqueKey = notifyUniqueKey(rule);
  await redisReleaseUnique(uniqueKey);
  removeFromIndex(memory.byInstall, rule.installationId, rule.id);
  removeFromIndex(memory.byTrain, rule.trainId, rule.id);
  await redisSrem(notifyInstallKey(rule.installationId), rule.id);
  await redisSrem(notifyTrainKey(rule.trainId), rule.id);
  await redisDelRule(rule.id);
}

export async function updateNotificationRule(
  ruleId: string,
  patch: UpdateNotificationRuleInput
): Promise<NotificationRule> {
  const existing = await redisGetRule(ruleId.trim());
  if (!existing) {
    throw new NotificationStoreError('NOT_FOUND', 'Notification rule not found.');
  }

  const next: NotificationRule = { ...existing };

  if ('stationCode' in patch) {
    next.stationCode = parseStationCode(patch.stationCode ?? undefined);
    if (!next.stationCode) delete next.stationCode;
  }

  if ('delayThresholdMinutes' in patch) {
    if (patch.delayThresholdMinutes == null) {
      delete next.delayThresholdMinutes;
    } else {
      next.delayThresholdMinutes = Math.floor(Number(patch.delayThresholdMinutes));
    }
  }

  if (typeof patch.enabled === 'boolean') {
    next.enabled = patch.enabled;
  }

  assertEventFields(next.eventType, next.delayThresholdMinutes);

  const oldUnique = notifyUniqueKey(existing);
  const newUnique = notifyUniqueKey(next);
  if (oldUnique !== newUnique) {
    const claimed = await redisClaimUnique(newUnique, next.id);
    if (!claimed) {
      throw new NotificationStoreError(
        'DUPLICATE_RULE',
        'A matching notification rule already exists for this installation.'
      );
    }
    await redisReleaseUnique(oldUnique);
  }

  if (existing.enabled && !next.enabled) {
    removeFromIndex(memory.byTrain, next.trainId, next.id);
    await redisSrem(notifyTrainKey(next.trainId), next.id);
  } else if (!existing.enabled && next.enabled) {
    addToIndex(memory.byTrain, next.trainId, next.id);
    await redisSadd(notifyTrainKey(next.trainId), next.id);
  }

  await redisSetRule(next);
  return next;
}

export async function markNotificationTriggered(
  ruleId: string,
  marker: string,
  at = new Date()
): Promise<NotificationRule> {
  const existing = await redisGetRule(ruleId.trim());
  if (!existing) {
    throw new NotificationStoreError('NOT_FOUND', 'Notification rule not found.');
  }

  const updated: NotificationRule = {
    ...existing,
    lastObservedMarker: marker,
    lastTriggeredAt: at.toISOString(),
  };
  await redisSetRule(updated);
  return updated;
}

/** Persist an observation marker without treating it as a user-facing trigger (e.g. first next-station snapshot). */
export async function markNotificationObserved(
  ruleId: string,
  marker: string
): Promise<NotificationRule> {
  const existing = await redisGetRule(ruleId.trim());
  if (!existing) {
    throw new NotificationStoreError('NOT_FOUND', 'Notification rule not found.');
  }

  const updated: NotificationRule = {
    ...existing,
    lastObservedMarker: marker,
  };
  await redisSetRule(updated);
  return updated;
}
