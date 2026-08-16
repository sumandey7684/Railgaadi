/**
 * Phase 4: Web Push delivery for DetectedNotificationEvent.
 * Does not detect events, schedule cron, or expose VAPID_PRIVATE_KEY.
 * Dedup is Phase 3 claimNotificationEventFire — this module does not add a second lock.
 */

import {
  listPushSubscriptionsForInstallation,
  parsePushEndpoint,
  removeExpiredPushSubscription,
} from '@/lib/push-subscriptions';
import { getConfiguredWebPush, isExpiredPushStatus } from '@/lib/vapid';
import { buildPushPayload, type RailGaadiPushPayload } from '@/lib/push-payload';
import type { DetectedNotificationEvent, JourneyEventDetectionResult } from '@/lib/notification-events';
import type { StoredPushSubscription } from '@/types/push';

export type DeliveryOutcome = 'sent' | 'expired' | 'failed' | 'retryable';

export interface SubscriptionDeliveryResult {
  endpoint: string;
  outcome: DeliveryOutcome;
  statusCode?: number;
  error?: string;
}

export interface EventDeliveryResult {
  ruleId: string;
  marker: string;
  payload: RailGaadiPushPayload;
  skipped?: 'no_subscriptions' | 'vapid_unconfigured';
  deliveries: SubscriptionDeliveryResult[];
}

export interface PushDeliveryReport {
  skipped?: 'fallback' | 'unavailable' | 'invalid_train_id' | 'empty';
  events: EventDeliveryResult[];
  sent: number;
  expired: number;
  failed: number;
  retryable: number;
}

export type WebPushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadJson: string
) => Promise<{ statusCode?: number } | void>;

export const PUSH_RETRYABLE_STATUS = 429;

function statusFromError(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

function isSendableSubscription(sub: StoredPushSubscription): boolean {
  if (!parsePushEndpoint(sub.endpoint)) return false;
  if (typeof sub.keys?.p256dh !== 'string' || sub.keys.p256dh.trim().length < 8) return false;
  if (typeof sub.keys?.auth !== 'string' || sub.keys.auth.trim().length < 8) return false;
  return true;
}

export async function defaultWebPushSend(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadJson: string
): Promise<{ statusCode?: number } | void> {
  const wp = getConfiguredWebPush();
  if (!wp) {
    const err = new Error('VAPID is not fully configured') as Error & { statusCode: number };
    err.statusCode = 503;
    throw err;
  }
  return wp.sendNotification(subscription, payloadJson, { TTL: 60 * 60, urgency: 'normal' });
}

async function deliverToSubscription(
  sub: StoredPushSubscription,
  payloadJson: string,
  sender: WebPushSender
): Promise<SubscriptionDeliveryResult> {
  if (!isSendableSubscription(sub)) {
    return {
      endpoint: sub.endpoint,
      outcome: 'failed',
      error: 'Malformed push subscription',
    };
  }

  try {
    const res = await sender(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      payloadJson
    );
    const statusCode = res && typeof res === 'object' ? res.statusCode : undefined;
    if (isExpiredPushStatus(statusCode)) {
      await removeExpiredPushSubscription(sub.endpoint);
      return { endpoint: sub.endpoint, outcome: 'expired', statusCode };
    }
    if (statusCode === PUSH_RETRYABLE_STATUS) {
      return { endpoint: sub.endpoint, outcome: 'retryable', statusCode };
    }
    if (statusCode != null && statusCode >= 400) {
      return { endpoint: sub.endpoint, outcome: 'failed', statusCode };
    }
    return { endpoint: sub.endpoint, outcome: 'sent', statusCode };
  } catch (err) {
    const statusCode = statusFromError(err);
    const message = err instanceof Error ? err.message : 'Push send failed';

    if (isExpiredPushStatus(statusCode)) {
      await removeExpiredPushSubscription(sub.endpoint);
      return { endpoint: sub.endpoint, outcome: 'expired', statusCode, error: message };
    }

    if (statusCode === PUSH_RETRYABLE_STATUS) {
      return { endpoint: sub.endpoint, outcome: 'retryable', statusCode, error: message };
    }

    return { endpoint: sub.endpoint, outcome: 'failed', statusCode, error: message };
  }
}

export async function deliverDetectedNotificationEvent(
  event: DetectedNotificationEvent,
  options?: { sender?: WebPushSender; subscriptions?: StoredPushSubscription[] }
): Promise<EventDeliveryResult> {
  const sender = options?.sender ?? defaultWebPushSend;
  const payload = buildPushPayload(event);
  const payloadJson = JSON.stringify(payload);

  if (!options?.sender && !getConfiguredWebPush()) {
    return {
      ruleId: event.ruleId,
      marker: event.marker,
      payload,
      skipped: 'vapid_unconfigured',
      deliveries: [],
    };
  }

  const subscriptions =
    options?.subscriptions ?? (await listPushSubscriptionsForInstallation(event.installationId));
  if (subscriptions.length === 0) {
    return {
      ruleId: event.ruleId,
      marker: event.marker,
      payload,
      skipped: 'no_subscriptions',
      deliveries: [],
    };
  }

  const deliveries: SubscriptionDeliveryResult[] = [];
  for (const sub of subscriptions) {
    try {
      deliveries.push(await deliverToSubscription(sub, payloadJson, sender));
    } catch (err) {
      deliveries.push({
        endpoint: sub.endpoint,
        outcome: 'failed',
        error: err instanceof Error ? err.message : 'Unexpected push error',
      });
    }
  }

  return { ruleId: event.ruleId, marker: event.marker, payload, deliveries };
}

export async function deliverDetectedNotificationEvents(
  detection: JourneyEventDetectionResult,
  options?: { sender?: WebPushSender }
): Promise<PushDeliveryReport> {
  if (
    detection.skipped === 'fallback' ||
    detection.skipped === 'unavailable' ||
    detection.skipped === 'invalid_train_id' ||
    detection.dataSource === 'fallback' ||
    detection.dataSource === 'unavailable'
  ) {
    const skipped =
      detection.skipped === 'invalid_train_id'
        ? 'invalid_train_id'
        : detection.skipped === 'unavailable' || detection.dataSource === 'unavailable'
          ? 'unavailable'
          : 'fallback';
    return { skipped, events: [], sent: 0, expired: 0, failed: 0, retryable: 0 };
  }

  if (detection.events.length === 0) {
    return { skipped: 'empty', events: [], sent: 0, expired: 0, failed: 0, retryable: 0 };
  }

  const events: EventDeliveryResult[] = [];
  let sent = 0;
  let expired = 0;
  let failed = 0;
  let retryable = 0;

  for (const event of detection.events) {
    const result = await deliverDetectedNotificationEvent(event, options);
    events.push(result);
    for (const d of result.deliveries) {
      if (d.outcome === 'sent') sent += 1;
      else if (d.outcome === 'expired') expired += 1;
      else if (d.outcome === 'retryable') retryable += 1;
      else failed += 1;
    }
  }

  return { events, sent, expired, failed, retryable };
}
