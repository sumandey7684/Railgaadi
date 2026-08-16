/**
 * Phase 3: deterministic journey → notification event detection.
 * Does not send Web Push. Does not schedule cron.
 *
 * Uses loadCachedLiveJourney + journeyNotifySnapshot + computeRuleObservation.
 * Fallback and unavailable journeys never emit events.
 */

import { loadCachedLiveJourney } from '@/lib/journey-loader';
import {
  claimNotificationEventFire,
  computeRuleObservation,
  isActiveEventMarker,
  journeyNotifySnapshot,
  listActiveRulesForTrain,
  markNotificationObserved,
  markNotificationTriggered,
  parseInstallationId,
  releaseNotificationEventFire,
} from '@/lib/notifications';
import { parseTrainId } from '@/lib/train-id';
import type { DataSource } from '@/types/api';
import type { JourneyNotifySnapshot, NotificationEventType, NotificationRule } from '@/types/notifications';
import type { LiveJourney } from '@/types/train';

export type DetectionSkipReason = 'invalid_train_id' | 'unavailable' | 'fallback';

export type DetectionAction = 'trigger' | 'observe' | 'none';

export interface DetectedNotificationEvent {
  ruleId: string;
  installationId: string;
  trainId: string;
  eventType: NotificationEventType;
  marker: string;
  stationCode?: string;
  delayMinutes?: number;
  snapshot: JourneyNotifySnapshot;
  detectedAt: string;
}

export interface RuleDetectionPlan {
  rule: NotificationRule;
  marker: string;
  action: DetectionAction;
}

export interface JourneyEventDetectionResult {
  trainId: string | null;
  skipped: DetectionSkipReason | null;
  dataSource?: DataSource;
  snapshot?: JourneyNotifySnapshot;
  events: DetectedNotificationEvent[];
  observedRuleIds: string[];
  suppressedDuplicateRuleIds: string[];
}

export function isNotifiableJourneySource(
  dataSource: DataSource | undefined,
  originSource?: 'live' | 'fallback'
): boolean {
  if (originSource === 'fallback') return false;
  if (!dataSource || dataSource === 'unavailable' || dataSource === 'fallback') return false;
  return dataSource === 'live' || dataSource === 'cached';
}

export function planRuleDetection(
  rule: NotificationRule,
  snapshot: JourneyNotifySnapshot
): RuleDetectionPlan {
  const { marker, shouldTrigger } = computeRuleObservation(rule, snapshot);
  if (shouldTrigger) return { rule, marker, action: 'trigger' };
  if (marker !== rule.lastObservedMarker) return { rule, marker, action: 'observe' };
  return { rule, marker, action: 'none' };
}

export function planRulesDetection(
  rules: NotificationRule[],
  snapshot: JourneyNotifySnapshot
): RuleDetectionPlan[] {
  return rules.filter((rule) => rule.enabled).map((rule) => planRuleDetection(rule, snapshot));
}

function toDetectedEvent(
  rule: NotificationRule,
  marker: string,
  snapshot: JourneyNotifySnapshot,
  at: Date
): DetectedNotificationEvent {
  const event: DetectedNotificationEvent = {
    ruleId: rule.id,
    installationId: rule.installationId,
    trainId: rule.trainId,
    eventType: rule.eventType,
    marker,
    snapshot,
    detectedAt: at.toISOString(),
  };
  if (rule.stationCode) event.stationCode = rule.stationCode;
  if (snapshot.delayMinutes != null) event.delayMinutes = snapshot.delayMinutes;
  return event;
}

export async function applyDetectionPlans(
  plans: RuleDetectionPlan[],
  snapshot: JourneyNotifySnapshot,
  at = new Date()
): Promise<{
  events: DetectedNotificationEvent[];
  observedRuleIds: string[];
  suppressedDuplicateRuleIds: string[];
}> {
  const events: DetectedNotificationEvent[] = [];
  const observedRuleIds: string[] = [];
  const suppressedDuplicateRuleIds: string[] = [];

  for (const plan of plans) {
    if (plan.action === 'none') continue;

    if (plan.action === 'observe') {
      const previous = plan.rule.lastObservedMarker;
      if (previous && isActiveEventMarker(previous)) {
        await releaseNotificationEventFire(plan.rule.id, previous);
      }
      await markNotificationObserved(plan.rule.id, plan.marker);
      observedRuleIds.push(plan.rule.id);
      continue;
    }

    const claimed = await claimNotificationEventFire(plan.rule.id, plan.marker);
    if (!claimed) {
      suppressedDuplicateRuleIds.push(plan.rule.id);
      continue;
    }

    await markNotificationTriggered(plan.rule.id, plan.marker, at);
    events.push(toDetectedEvent(plan.rule, plan.marker, snapshot, at));
  }

  return { events, observedRuleIds, suppressedDuplicateRuleIds };
}

export async function detectNotificationEventsForSnapshot(input: {
  trainId: string;
  snapshot: JourneyNotifySnapshot;
  rules: NotificationRule[];
  dataSource?: DataSource;
  originSource?: 'live' | 'fallback';
}): Promise<JourneyEventDetectionResult> {
  const trainId = parseTrainId(input.trainId);
  if (!trainId) {
    return { trainId: null, skipped: 'invalid_train_id', events: [], observedRuleIds: [], suppressedDuplicateRuleIds: [] };
  }

  if (!isNotifiableJourneySource(input.dataSource ?? 'live', input.originSource)) {
    return {
      trainId,
      skipped: input.dataSource === 'unavailable' ? 'unavailable' : 'fallback',
      dataSource: input.dataSource,
      snapshot: input.snapshot,
      events: [],
      observedRuleIds: [],
      suppressedDuplicateRuleIds: [],
    };
  }

  const rules = input.rules.filter((rule) => {
    if (!rule.enabled || rule.trainId !== trainId) return false;
    return Boolean(parseInstallationId(rule.installationId));
  });

  const plans = planRulesDetection(rules, input.snapshot);
  const applied = await applyDetectionPlans(plans, input.snapshot);
  return {
    trainId,
    skipped: null,
    dataSource: input.dataSource ?? 'live',
    snapshot: input.snapshot,
    ...applied,
  };
}

/**
 * Load the cached live journey and detect transitions for active rules.
 * Never emits events for fallback or unavailable data.
 */
export async function detectJourneyNotificationEvents(
  trainId: string
): Promise<JourneyEventDetectionResult> {
  const id = parseTrainId(trainId);
  if (!id) {
    return { trainId: null, skipped: 'invalid_train_id', events: [], observedRuleIds: [], suppressedDuplicateRuleIds: [] };
  }

  const loaded = await loadCachedLiveJourney(id);
  if (!loaded.ok) {
    return {
      trainId: id,
      skipped: 'unavailable',
      dataSource: loaded.dataSource,
      events: [],
      observedRuleIds: [],
      suppressedDuplicateRuleIds: [],
    };
  }

  const originSource = loaded.originSource;
  if (!isNotifiableJourneySource(loaded.dataSource, originSource)) {
    return {
      trainId: id,
      skipped: 'fallback',
      dataSource: loaded.dataSource,
      snapshot: journeyNotifySnapshot(loaded.journey),
      events: [],
      observedRuleIds: [],
      suppressedDuplicateRuleIds: [],
    };
  }

  const snapshot = journeyNotifySnapshot(loaded.journey);
  const rules = await listActiveRulesForTrain(id);
  return detectNotificationEventsForSnapshot({
    trainId: id,
    snapshot,
    rules,
    dataSource: loaded.dataSource,
    originSource,
  });
}

export function snapshotFromJourney(journey: LiveJourney): JourneyNotifySnapshot {
  return journeyNotifySnapshot(journey);
}
