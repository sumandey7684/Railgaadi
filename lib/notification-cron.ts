/**
 * Phase 5: scheduled notification worker.
 * Groups active rules by train, loads each journey once via loadCachedLiveJourney
 * (inside Phase 3 detectJourneyNotificationEvents), then delivers via Phase 4.
 * Does not reimplement detection, delivery, cache, budget, or CRUD.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { getRedis, logRedisFailure } from '@/lib/redis';
import {
  listActiveRulesForTrain,
  listTrainIdsWithActiveRules,
} from '@/lib/notifications';
import { detectJourneyNotificationEvents } from '@/lib/notification-events';
import { deliverDetectedNotificationEvents } from '@/lib/push-delivery';
import type { JourneyEventDetectionResult } from '@/lib/notification-events';
import type { PushDeliveryReport } from '@/lib/push-delivery';
import type { NotificationRule } from '@/types/notifications';

export const NOTIFICATION_CRON_LOCK_KEY = 'rg:notify:cron:lock';
/** Shorter than the 1-minute cron interval so a crashed run cannot stick forever. */
export const NOTIFICATION_CRON_LOCK_TTL_SECONDS = 45;
/** Caps uncached RailRadar fan-out per tick; daily budget still applies. */
export const MAX_TRAINS_PER_NOTIFICATION_CRON = 8;

export interface NotificationCronResult {
  ok: true;
  processedTrains: number;
  processedRules: number;
  detectedEvents: number;
  sent: number;
  expired: number;
  failed: number;
  retryable: number;
  skipped: number;
  lockHeld?: boolean;
  truncated?: boolean;
}

export type NotificationCronDetect = (trainId: string) => Promise<JourneyEventDetectionResult>;
export type NotificationCronDeliver = (
  detection: JourneyEventDetectionResult
) => Promise<PushDeliveryReport>;

export interface NotificationCronOptions {
  detect?: NotificationCronDetect;
  deliver?: NotificationCronDeliver;
  listTrainIds?: () => Promise<string[]>;
  listRules?: (trainId: string) => Promise<NotificationRule[]>;
  maxTrains?: number;
}

interface MemoryLock {
  token: string;
  expiresAt: number;
}

let memoryLock: MemoryLock | null = null;

export function resetNotificationCronLockForTests() {
  memoryLock = null;
}

export function expireNotificationCronLockForTests() {
  if (memoryLock) memoryLock.expiresAt = 0;
}

function emptyResult(extra: Partial<NotificationCronResult> = {}): NotificationCronResult {
  return {
    ok: true,
    processedTrains: 0,
    processedRules: 0,
    detectedEvents: 0,
    sent: 0,
    expired: 0,
    failed: 0,
    retryable: 0,
    skipped: 0,
    ...extra,
  };
}

function cronSecret(): string {
  return (process.env.CRON_SECRET || '').trim();
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

async function acquireCronLock(): Promise<string | null> {
  const token = randomUUID();
  const now = Date.now();
  if (memoryLock && memoryLock.expiresAt > now) return null;

  // Claim in-process before any await so overlapping ticks cannot both proceed.
  memoryLock = { token, expiresAt: now + NOTIFICATION_CRON_LOCK_TTL_SECONDS * 1000 };

  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(NOTIFICATION_CRON_LOCK_KEY, token, {
        nx: true,
        ex: NOTIFICATION_CRON_LOCK_TTL_SECONDS,
      });
      if (!ok) {
        if (memoryLock?.token === token) memoryLock = null;
        return null;
      }
      return token;
    } catch (error) {
      logRedisFailure('notify cron lock', error);
      return token;
    }
  }

  return token;
}

async function releaseCronLock(token: string): Promise<void> {
  try {
    if (memoryLock?.token === token) memoryLock = null;
    const redis = getRedis();
    if (!redis) return;
    const current = await redis.get<string>(NOTIFICATION_CRON_LOCK_KEY);
    if (current === token) await redis.del(NOTIFICATION_CRON_LOCK_KEY);
  } catch (error) {
    logRedisFailure('notify cron unlock', error);
    if (memoryLock?.token === token) memoryLock = null;
  }
}

export async function runNotificationCron(
  options: NotificationCronOptions = {}
): Promise<NotificationCronResult> {
  const token = await acquireCronLock();
  if (!token) return emptyResult({ lockHeld: true });

  const detect = options.detect ?? detectJourneyNotificationEvents;
  const deliver = options.deliver ?? deliverDetectedNotificationEvents;
  const listTrainIds = options.listTrainIds ?? listTrainIdsWithActiveRules;
  const listRules = options.listRules ?? listActiveRulesForTrain;
  const maxTrains = options.maxTrains ?? MAX_TRAINS_PER_NOTIFICATION_CRON;

  try {
    const trainIds = await listTrainIds();
    const unique = [...new Set(trainIds)];
    const truncated = unique.length > maxTrains;
    const batch = unique.slice(0, maxTrains);
    let skipped = truncated ? unique.length - batch.length : 0;

    const totals = emptyResult({ truncated: truncated || undefined, skipped });

    for (const trainId of batch) {
      try {
        const rules = await listRules(trainId);
        totals.processedTrains += 1;
        totals.processedRules += rules.length;

        const detection = await detect(trainId);
        if (detection.skipped) {
          totals.skipped += 1;
          continue;
        }

        totals.detectedEvents += detection.events.length;
        const report = await deliver(detection);
        totals.sent += report.sent;
        totals.expired += report.expired;
        totals.failed += report.failed;
        totals.retryable += report.retryable;
        if (report.skipped === 'fallback' || report.skipped === 'unavailable') {
          totals.skipped += 1;
        }
      } catch {
        totals.failed += 1;
      }
    }

    return totals;
  } finally {
    await releaseCronLock(token);
  }
}
