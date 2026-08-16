import type { NotificationEventType } from '@/types/notifications';
import type { DetectedNotificationEvent } from '@/lib/notification-events';
import { parseTrainId } from '@/lib/train-id';

export interface RailGaadiPushPayload {
  title: string;
  body: string;
  trainId: string;
  eventType: NotificationEventType;
  stationCode?: string;
  ruleId: string;
  timestamp: string;
  url: string;
}

const TITLES: Record<NotificationEventType, string> = {
  approaching_station: 'Approaching station',
  station_arrived: 'Arrived at station',
  station_departed: 'Departed station',
  delay_threshold: 'Delay alert',
  next_station_changed: 'Next station changed',
  journey_completed: 'Journey complete',
};

export function trainNotificationUrl(trainId: string): string {
  const id = parseTrainId(trainId) ?? trainId.trim();
  return `/train/${id}`;
}

export function buildPushPayload(event: DetectedNotificationEvent): RailGaadiPushPayload {
  const station =
    event.stationCode ||
    event.snapshot.nextHaltCode ||
    event.snapshot.currentHaltCode ||
    event.snapshot.previousHaltCode;
  const delay = event.delayMinutes ?? event.snapshot.delayMinutes;

  let body = `Train ${event.trainId}`;
  switch (event.eventType) {
    case 'approaching_station':
      body = station ? `Train ${event.trainId} is approaching ${station}.` : `Train ${event.trainId} is approaching the next halt.`;
      break;
    case 'station_arrived':
      body = station ? `Train ${event.trainId} has arrived at ${station}.` : `Train ${event.trainId} has arrived at a halt.`;
      break;
    case 'station_departed':
      body = station ? `Train ${event.trainId} has departed ${station}.` : `Train ${event.trainId} has departed a halt.`;
      break;
    case 'delay_threshold':
      body =
        delay != null
          ? `Train ${event.trainId} is delayed by ${delay} min.`
          : `Train ${event.trainId} crossed a delay threshold.`;
      break;
    case 'next_station_changed':
      body = station ? `Train ${event.trainId} next halt is now ${station}.` : `Train ${event.trainId} next halt changed.`;
      break;
    case 'journey_completed':
      body = `Train ${event.trainId} has completed its journey.`;
      break;
  }

  const payload: RailGaadiPushPayload = {
    title: TITLES[event.eventType],
    body,
    trainId: event.trainId,
    eventType: event.eventType,
    ruleId: event.ruleId,
    timestamp: event.detectedAt,
    url: trainNotificationUrl(event.trainId),
  };
  if (event.stationCode) payload.stationCode = event.stationCode;
  return payload;
}
