export type StationStatus = 'passed' | 'current' | 'upcoming';
export type StationTimeSource = 'actual' | 'expected' | 'scheduled' | 'unknown';
export type PositionSource = 'gps' | 'station' | 'interpolated' | 'fallback';
export type SpeedSource = 'live' | 'average' | 'unknown';
export type ProgressSource = 'gps' | 'station' | 'estimated';

export interface Station {
  code: string;
  name: string;
  lat: number;
  lng: number;
  scheduledArrival: string;
  scheduledDeparture: string;
  actualArrival?: string;
  actualDeparture?: string;
  expectedArrival?: string;
  expectedDeparture?: string;
  arrivalSource: StationTimeSource;
  departureSource: StationTimeSource;
  /** Present only when RailRadar (or an estimated inheritance) provided a delay. */
  delayMinutes?: number;
  delayEstimated?: boolean;
  distanceKm: number;
  status: StationStatus;
  isHalt: boolean;
  platform?: string;
  haltMinutes?: number;
}

export interface SearchResult {
  id: string;
  number: string;
  name: string;
  origin: {
    code: string;
    name: string;
  };
  destination: {
    code: string;
    name: string;
  };
  runsOn?: string[];
  duration?: string;
  departureTime?: string;
  arrivalTime?: string;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
  isMoving: boolean;
  source: PositionSource;
}

export interface LiveJourney {
  trainId: string;
  number: string;
  name: string;
  origin: {
    code: string;
    name: string;
  };
  destination: {
    code: string;
    name: string;
  };
  currentLocation: LiveLocation;
  status: 'running' | 'delayed' | 'on_time' | 'cancelled' | 'not_started' | 'completed';
  delayMinutes?: number;
  speedKmh?: number;
  speedSource: SpeedSource;
  typicalSpeedKmh?: number;
  distanceCoveredKm: number;
  remainingDistanceKm: number;
  totalDistanceKm: number;
  completionPercentage: number;
  progressSource: ProgressSource;
  lastUpdated: string; // ISO timestamp
  previousStation?: Station;
  currentStation?: Station;
  nextStation?: Station;
  nextHalt?: Station;
  ETA: string;
  etaEstimated?: boolean;
  stations: Station[];
  routeGeometry?: [number, number][]; // Array of [lng, lat] for MapLibre polyline
}
