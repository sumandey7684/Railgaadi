/**
 * Notification domain (Phase 1).
 *
 * Persistence: Upstash Redis when configured (`rg:notify:*` keys).
 * If Redis is unset or errors, a process-local memory store is used — same
 * pattern as cache/rate-limit/budget. Memory is **not** durable across
 * restarts or instances. Production notification persistence requires the
 * existing `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` pair.
 * No new environment variables. Records never store VAPID keys or push endpoints.
 */

export const NOTIFICATION_EVENT_TYPES = [
  'approaching_station',
  'station_arrived',
  'station_departed',
  'delay_threshold',
  'next_station_changed',
  'journey_completed',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Snapshot of journey-state fields used for rule matching (no GPS payloads). */
export interface JourneyNotifySnapshot {
  trainId: string;
  status: string;
  delayMinutes?: number;
  currentHaltCode?: string;
  previousHaltCode?: string;
  nextHaltCode?: string;
}

export interface NotificationRule {
  id: string;
  installationId: string;
  trainId: string;
  stationCode?: string;
  eventType: NotificationEventType;
  delayThresholdMinutes?: number;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  /** Dedup / idle marker, e.g. `approaching:NDLS` or `delay:idle:15`. */
  lastObservedMarker?: string;
}

export interface CreateNotificationRuleInput {
  installationId: string;
  trainId: string;
  eventType: NotificationEventType;
  stationCode?: string;
  delayThresholdMinutes?: number;
  enabled?: boolean;
}

export interface UpdateNotificationRuleInput {
  stationCode?: string | null;
  delayThresholdMinutes?: number | null;
  enabled?: boolean;
}
