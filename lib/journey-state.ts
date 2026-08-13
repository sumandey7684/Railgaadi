import { LiveJourney, Station, StationTimeSource, PositionSource, ProgressSource } from '@/types/train';

export interface StationTimeView {
  time: string;
  source: StationTimeSource;
  label: 'SCH' | 'ACT' | 'EXP' | '';
}

export interface MapPosition {
  lat: number;
  lng: number;
  source: PositionSource;
}

export interface JourneyProgress {
  coveredKm: number;
  remainingKm: number;
  totalKm: number;
  pct: number;
  source: ProgressSource;
}

export function isPassengerHalt(station: Station): boolean {
  return station.isHalt;
}

export function haltStations(journey: LiveJourney): Station[] {
  return journey.stations.filter(isPassengerHalt);
}

export function currentHalt(journey: LiveJourney): Station | undefined {
  return journey.currentStation;
}

export function previousHalt(journey: LiveJourney): Station | undefined {
  return journey.previousStation;
}

export function nextHalt(journey: LiveJourney): Station | undefined {
  return journey.nextHalt || journey.nextStation;
}

export function stationStatus(station: Station): Station['status'] {
  return station.status;
}

function timeView(time: string | undefined, source: StationTimeSource): StationTimeView {
  if (!time || time === '--:--' || source === 'unknown') {
    return { time: '—', source: 'unknown', label: '' };
  }
  if (source === 'actual') return { time, source, label: 'ACT' };
  if (source === 'expected') return { time, source, label: 'EXP' };
  return { time, source, label: 'SCH' };
}

export function stationArrivalView(station: Station): StationTimeView {
  if (station.arrivalSource === 'actual') return timeView(station.actualArrival, 'actual');
  if (station.arrivalSource === 'expected') {
    return timeView(station.expectedArrival || station.actualArrival, 'expected');
  }
  return timeView(station.scheduledArrival, station.arrivalSource);
}

export function stationDepartureView(station: Station): StationTimeView {
  if (station.departureSource === 'actual') return timeView(station.actualDeparture, 'actual');
  if (station.departureSource === 'expected') {
    return timeView(station.expectedDeparture || station.actualDeparture, 'expected');
  }
  return timeView(station.scheduledDeparture, station.departureSource);
}

export function stationScheduledArrival(station: Station): StationTimeView {
  return timeView(station.scheduledArrival, 'scheduled');
}

export function mapPosition(journey: LiveJourney): MapPosition {
  return {
    lat: journey.currentLocation.lat,
    lng: journey.currentLocation.lng,
    source: journey.currentLocation.source,
  };
}

export function journeyProgress(journey: LiveJourney): JourneyProgress {
  return {
    coveredKm: journey.distanceCoveredKm,
    remainingKm: journey.remainingDistanceKm,
    totalKm: journey.totalDistanceKm,
    pct: journey.completionPercentage,
    source: journey.progressSource,
  };
}

export function delayLabel(station: Station): { text: string; estimated: boolean; known: boolean } {
  if (station.delayMinutes == null) {
    return { text: '', estimated: false, known: false };
  }
  if (station.delayMinutes <= 0) {
    return { text: 'On Time', estimated: false, known: true };
  }
  const suffix = station.delayEstimated ? ' est.' : '';
  return { text: `+${station.delayMinutes}m${suffix}`, estimated: Boolean(station.delayEstimated), known: true };
}
