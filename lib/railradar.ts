import { SearchResult, LiveJourney, Station } from '@/types/train';
import { DataSource } from '@/types/api';
import { env } from '@/config/env';
import { searchLocalTrains, TRAINS_DB } from '@/lib/trains-db';
import { interpolateAlongRoute, progressAlongRoute, LngLat } from '@/lib/geo';

const RR_BASE = 'https://api.railradar.in/v1';

function rrHeaders() {
  return {
    Authorization: `Bearer ${env.RAILRADAR_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function extractErrorMessage(json: any): string {
  if (!json) return 'Unknown error';
  if (json.error?.message) return `${json.error.code}: ${json.error.message}`;
  if (typeof json.error === 'string') return json.error;
  if (json.message) return json.message;
  return 'Unknown API error';
}

/**
 * Fetch wrapper with a 4-second timeout to prevent Node undici connect timeouts.
 */
async function rrFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...rrHeaders(), ...(options?.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Type helpers for RailRadar raw API shapes ─────────────────────────────

interface RRStation {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

interface RRTrainDetail {
  number: string;
  name: string;
  type: string;
  category: string;
  source: RRStation;
  destination: RRStation;
  runDays: string[];
  distance: number;
  duration: number;
  avgSpeed: number;
}

interface RRRouteStop {
  sequence: number;
  station?: RRStation;
  stationCode?: string;
  stationName?: string;
  isHalt: boolean;
  platform?: string;
  arrival?: string;
  departure?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  actualArrival?: string;
  actualDeparture?: string;
  delayArrival?: number;
  delayDeparture?: number;
  distance: number;
  status?: string;
}

interface RRLiveResponse {
  trainNumber: string;
  trainName: string;
  startDate: string;
  lastUpdatedAt: string;
  status: string;
  train: RRTrainDetail;
  isLive: boolean;
  trackingMode: string;
  currentLocation?: {
    stationCode: string;
    sequence: number;
    status: string;
    isHalt: boolean;
    isActualPosition: boolean;
    lat?: number;
    lng?: number;
  };
  nextHalt?: {
    stationCode: string;
    stationName: string;
    sequence: number;
    distance: number;
  };
  delayMinutes: number;
  route: RRRouteStop[];
}

function normaliseStatus(status: string): LiveJourney['status'] {
  switch (status) {
    case 'running': return 'running';
    case 'not-started': return 'not_started';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    default: return 'running';
  }
}

function parseClock(val?: string): string | undefined {
  if (!val) return undefined;
  if (val.includes('T')) {
    return new Date(val).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });
  }
  return val;
}

function minutesFromClock(time?: string): number | undefined {
  if (!time || time === '--:--') return undefined;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function addMinutesToClock(time: string, minutes: number): string | undefined {
  const base = minutesFromClock(time);
  if (base == null) return undefined;
  const wrapped = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function haltMinutesFromSchedule(arrival?: string, departure?: string): number | undefined {
  const arr = minutesFromClock(arrival);
  const dep = minutesFromClock(departure);
  if (arr == null || dep == null) return undefined;
  let halt = dep - arr;
  if (halt < 0) halt += 24 * 60;
  if (halt <= 0 || halt > 180) return undefined;
  return halt;
}

function routeStopStatus(rawStatus?: string): Station['status'] {
  const raw = (rawStatus || '').toLowerCase();
  if (raw === 'departed' || raw === 'passed') return 'passed';
  if (raw === 'at-station' || raw === 'arrived') return 'current';
  return 'upcoming';
}

function collapseStationStatuses(stations: Station[]): void {
  let lastPassed = -1;
  stations.forEach((st, i) => {
    if (st.status === 'passed') lastPassed = i;
  });
  stations.forEach((st, i) => {
    if (st.status === 'current' && i < lastPassed) st.status = 'passed';
  });

  const currentIndexes = stations
    .map((st, i) => (st.status === 'current' ? i : -1))
    .filter((i) => i >= 0);
  if (currentIndexes.length > 1) {
    const keep = currentIndexes[currentIndexes.length - 1];
    currentIndexes.forEach((i) => {
      if (i !== keep) stations[i].status = 'passed';
    });
  }
}

function markPassengerHalts(stations: Station[], originCode: string, destCode: string): void {
  const apiMarkedAny = stations.some((st) => st.isHalt);
  if (apiMarkedAny) {
    stations.forEach((st) => {
      if (st.code === originCode || st.code === destCode) st.isHalt = true;
    });
    return;
  }
  stations.forEach((st) => {
    st.isHalt = Boolean(
      st.platform ||
        st.delayMinutes != null ||
        st.code === originCode ||
        st.code === destCode
    );
  });
}

function assignTimeSources(st: Station): void {
  const hasSchedArr = Boolean(st.scheduledArrival && st.scheduledArrival !== '--:--');
  const hasSchedDep = Boolean(st.scheduledDeparture && st.scheduledDeparture !== '--:--');

  if (st.status === 'upcoming') {
    if (st.actualArrival) {
      st.expectedArrival = st.actualArrival;
      st.arrivalSource = 'expected';
    } else if (hasSchedArr) {
      st.arrivalSource = 'scheduled';
    } else {
      st.arrivalSource = 'unknown';
    }
    if (st.actualDeparture) {
      st.expectedDeparture = st.actualDeparture;
      st.departureSource = 'expected';
    } else if (hasSchedDep) {
      st.departureSource = 'scheduled';
    } else {
      st.departureSource = 'unknown';
    }
    return;
  }

  st.arrivalSource = st.actualArrival ? 'actual' : hasSchedArr ? 'scheduled' : 'unknown';
  st.departureSource = st.actualDeparture ? 'actual' : hasSchedDep ? 'scheduled' : 'unknown';
}

function applyExpectedDelay(stations: Station[], trainDelay?: number): void {
  if (trainDelay == null || trainDelay <= 0) return;
  stations.forEach((st) => {
    if (st.status !== 'upcoming' || !st.isHalt || st.delayMinutes != null) return;
    st.delayMinutes = trainDelay;
    st.delayEstimated = true;
    if (!st.expectedArrival && st.scheduledArrival && st.scheduledArrival !== '--:--') {
      const expected = addMinutesToClock(st.scheduledArrival, trainDelay);
      if (expected) {
        st.expectedArrival = expected;
        st.arrivalSource = 'expected';
      }
    }
    if (!st.expectedDeparture && st.scheduledDeparture && st.scheduledDeparture !== '--:--') {
      const expected = addMinutesToClock(st.scheduledDeparture, trainDelay);
      if (expected) {
        st.expectedDeparture = expected;
        st.departureSource = 'expected';
      }
    }
  });
}

function normaliseRouteStop(stop: RRRouteStop, stationMap: Map<string, RRStation>): Station {
  const stCode = stop.stationCode || stop.station?.code || '';
  const stInfo = stationMap.get(stCode) || stop.station;
  const scheduledArrival = parseClock(stop.scheduledArrival || stop.arrival) || '--:--';
  const scheduledDeparture = parseClock(stop.scheduledDeparture || stop.departure) || '--:--';
  const delayArrival = stop.delayArrival;
  const delayDeparture = stop.delayDeparture;

  return {
    code: stCode,
    name: stop.stationName || stop.station?.name || stCode,
    lat: stInfo?.lat ?? 0,
    lng: stInfo?.lng ?? 0,
    scheduledArrival,
    scheduledDeparture,
    actualArrival: parseClock(stop.actualArrival) || undefined,
    actualDeparture: parseClock(stop.actualDeparture) || undefined,
    arrivalSource: 'scheduled',
    departureSource: 'scheduled',
    delayMinutes: delayArrival ?? delayDeparture,
    distanceKm: Math.round(stop.distance || 0),
    status: routeStopStatus(stop.status),
    isHalt: Boolean(stop.isHalt),
    platform: stop.platform || undefined,
    haltMinutes: haltMinutesFromSchedule(scheduledArrival, scheduledDeparture),
  };
}

function interpolatePolyline(coords: [number, number][], pct: number): [number, number] {
  return interpolateAlongRoute(coords as LngLat[], pct);
}

function normaliseLiveResponse(raw: RRLiveResponse, routeGeo?: [number, number][]): LiveJourney {
  const train = raw.train;

  const stationMap = new Map<string, RRStation>();
  if (train.source) stationMap.set(train.source.code, train.source);
  if (train.destination) stationMap.set(train.destination.code, train.destination);

  const relevantStops = raw.route.filter((s) => s.isHalt || s.stationCode || s.station?.code);
  const totalDistanceKm = train.distance || Math.round(relevantStops[relevantStops.length - 1]?.distance || 0);

  const stations = relevantStops.map((s) => {
    const st = normaliseRouteStop(s, stationMap);
    if ((!st.lat || !st.lng) && routeGeo && routeGeo.length >= 2 && totalDistanceKm > 0) {
      const pct = Math.min(100, Math.max(0, (st.distanceKm / totalDistanceKm) * 100));
      const [lng, lat] = interpolatePolyline(routeGeo, pct);
      st.lat = lat;
      st.lng = lng;
    }
    return st;
  });

  collapseStationStatuses(stations);
  markPassengerHalts(stations, train.source.code, train.destination.code);
  stations.forEach(assignTimeSources);

  const trainDelay = typeof raw.delayMinutes === 'number' ? raw.delayMinutes : undefined;
  applyExpectedDelay(stations, trainDelay);

  const halts = stations.filter((st) => st.isHalt);
  const currentHalt = [...halts].reverse().find((st) => st.status === 'current');
  const previousHalt = [...halts].reverse().find((st) => st.status === 'passed');
  const nextFromApi = raw.nextHalt?.stationCode
    ? halts.find((st) => st.code === raw.nextHalt!.stationCode && st.status === 'upcoming')
    : undefined;
  const nextHalt = nextFromApi || halts.find((st) => st.status === 'upcoming');

  const loc = raw.currentLocation;
  const hasCoords = Boolean(loc?.lat && loc?.lng);
  let positionSource: LiveJourney['currentLocation']['source'] = 'fallback';
  let trainLat = train.source.lat;
  let trainLng = train.source.lng;
  const stationPct =
    totalDistanceKm > 0
      ? Math.min(
          100,
          Math.max(0, ((currentHalt?.distanceKm || previousHalt?.distanceKm || 0) / totalDistanceKm) * 100)
        )
      : 0;

  if (hasCoords && loc?.isActualPosition) {
    trainLat = loc.lat as number;
    trainLng = loc.lng as number;
    positionSource = 'gps';
  } else if (hasCoords) {
    trainLat = loc!.lat as number;
    trainLng = loc!.lng as number;
    positionSource = 'station';
  } else if (currentHalt?.lat && currentHalt?.lng) {
    trainLat = currentHalt.lat;
    trainLng = currentHalt.lng;
    positionSource = 'station';
  } else if (routeGeo && routeGeo.length >= 2) {
    const [lng, lat] = interpolatePolyline(routeGeo, stationPct);
    trainLng = lng;
    trainLat = lat;
    positionSource = 'interpolated';
  } else if (previousHalt?.lat && previousHalt?.lng) {
    trainLat = previousHalt.lat;
    trainLng = previousHalt.lng;
    positionSource = 'station';
  }

  let coveredKm = currentHalt?.distanceKm ?? previousHalt?.distanceKm ?? 0;
  let remainingKm = Math.max(0, totalDistanceKm - coveredKm);
  let completion = totalDistanceKm > 0 ? Math.min(100, (coveredKm / totalDistanceKm) * 100) : 0;
  let progressSource: LiveJourney['progressSource'] = 'station';

  if (positionSource === 'gps' && routeGeo && routeGeo.length >= 2) {
    const gpsProgress = progressAlongRoute(routeGeo as LngLat[], [trainLng, trainLat]);
    if (gpsProgress) {
      coveredKm = Math.round(gpsProgress.coveredKm);
      remainingKm = Math.max(0, Math.round(gpsProgress.totalKm - gpsProgress.coveredKm));
      completion = gpsProgress.pct;
      progressSource = 'gps';
    }
  } else if (positionSource === 'interpolated') {
    progressSource = 'estimated';
  }

  const typicalSpeedKmh = train.avgSpeed ? Math.round(train.avgSpeed) : undefined;
  const etaTime =
    nextHalt?.arrivalSource === 'expected'
      ? nextHalt.expectedArrival || nextHalt.actualArrival
      : nextHalt?.expectedArrival || nextHalt?.scheduledArrival;
  const etaEstimated = nextHalt?.arrivalSource === 'expected' || Boolean(nextHalt?.delayEstimated);
  const etaStr =
    nextHalt && etaTime && etaTime !== '--:--'
      ? `${nextHalt.name} at ${etaTime}${etaEstimated ? ' (exp.)' : ''}`
      : nextHalt
      ? `${nextHalt.name}`
      : 'Calculating...';

  return {
    trainId: raw.trainNumber,
    number: raw.trainNumber,
    name: raw.trainName,
    origin: { code: train.source.code, name: train.source.name },
    destination: { code: train.destination.code, name: train.destination.name },
    currentLocation: {
      lat: trainLat,
      lng: trainLng,
      isMoving: raw.status === 'running',
      source: positionSource,
    },
    status: normaliseStatus(raw.status),
    delayMinutes: trainDelay,
    speedSource: 'unknown',
    typicalSpeedKmh,
    distanceCoveredKm: Math.round(coveredKm),
    remainingDistanceKm: Math.round(remainingKm),
    totalDistanceKm,
    completionPercentage: Math.round(completion * 10) / 10,
    progressSource,
    lastUpdated: raw.lastUpdatedAt || new Date().toISOString(),
    ETA: etaStr,
    etaEstimated,
    previousStation: previousHalt,
    currentStation: currentHalt,
    nextStation: nextHalt,
    nextHalt,
    stations,
    routeGeometry: routeGeo,
  };
}

async function fetchRouteGeometry(trainNumber: string): Promise<[number, number][] | undefined> {
  try {
    const res = await rrFetch(`${RR_BASE}/trains/${trainNumber}/route`, {
      next: { revalidate: 86400 },
    } as any);
    if (!res.ok) return undefined;
    const json = await res.json();
    if (!json.success) return undefined;
    const coords: [number, number][] | undefined = json?.data?.geojson?.geometry?.coordinates;
    if (coords && coords.length > 200) {
      const step = Math.ceil(coords.length / 200);
      return coords.filter((_, i) => i % step === 0);
    }
    return coords;
  } catch {
    return undefined;
  }
}

// ─── Fallback Journey Generator ──────────────────────────────────────────

function generateFallbackJourney(trainNumber: string): LiveJourney | null {
  const train = TRAINS_DB.find((t) => t.number === trainNumber) || {
    number: trainNumber,
    name: `Express Train #${trainNumber}`,
    from: 'Mumbai Central',
    fromCode: 'MMCT',
    to: 'New Delhi',
    toCode: 'NDLS',
  };

  const stations: Station[] = [
    {
      code: train.fromCode,
      name: train.from,
      lat: 18.9696,
      lng: 72.8193,
      scheduledArrival: '17:00',
      scheduledDeparture: '17:00',
      actualArrival: '17:00',
      actualDeparture: '17:00',
      arrivalSource: 'actual',
      departureSource: 'actual',
      delayMinutes: 0,
      distanceKm: 0,
      status: 'passed',
      isHalt: true,
      platform: '1',
    },
    {
      code: 'ST',
      name: 'Surat',
      lat: 21.2049,
      lng: 72.8406,
      scheduledArrival: '20:10',
      scheduledDeparture: '20:15',
      actualArrival: '20:14',
      actualDeparture: '20:19',
      arrivalSource: 'actual',
      departureSource: 'actual',
      delayMinutes: 4,
      distanceKm: 263,
      status: 'passed',
      isHalt: true,
      platform: '1',
      haltMinutes: 5,
    },
    {
      code: 'KOTA',
      name: 'Kota Junction',
      lat: 25.2138,
      lng: 75.8648,
      scheduledArrival: '03:15',
      scheduledDeparture: '03:25',
      actualArrival: '03:23',
      actualDeparture: '03:33',
      arrivalSource: 'actual',
      departureSource: 'actual',
      delayMinutes: 8,
      distanceKm: 920,
      status: 'current',
      isHalt: true,
      platform: '1',
      haltMinutes: 10,
    },
    {
      code: train.toCode,
      name: train.to,
      lat: 28.643,
      lng: 77.2194,
      scheduledArrival: '08:32',
      scheduledDeparture: '08:32',
      expectedArrival: '08:40',
      arrivalSource: 'expected',
      departureSource: 'scheduled',
      delayMinutes: 8,
      delayEstimated: true,
      distanceKm: 1384,
      status: 'upcoming',
      isHalt: true,
      platform: '1',
    },
  ];

  return {
    trainId: train.number,
    number: train.number,
    name: train.name,
    origin: { code: train.fromCode, name: train.from },
    destination: { code: train.toCode, name: train.to },
    currentLocation: {
      lat: 25.2138,
      lng: 75.8648,
      isMoving: true,
      source: 'fallback',
    },
    status: 'running',
    delayMinutes: 8,
    speedSource: 'unknown',
    typicalSpeedKmh: 110,
    distanceCoveredKm: 920,
    remainingDistanceKm: 464,
    totalDistanceKm: 1384,
    completionPercentage: 66.5,
    progressSource: 'estimated',
    lastUpdated: new Date().toISOString(),
    ETA: `${stations[3].name} at 08:40 (exp.)`,
    etaEstimated: true,
    previousStation: stations[1],
    currentStation: stations[2],
    nextStation: stations[3],
    nextHalt: stations[3],
    stations,
    routeGeometry: [
      [72.8193, 18.9696],
      [72.8406, 21.2049],
      [75.8648, 25.2138],
      [77.2194, 28.643],
    ],
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function searchTrains(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) {
    return searchLocalTrains('').map((t) => ({
      id: t.number,
      number: t.number,
      name: t.name,
      origin: { code: t.fromCode, name: t.from },
      destination: { code: t.toCode, name: t.to },
    }));
  }

  try {
    const res = await rrFetch(`${RR_BASE}/lookup/trains?q=${encodeURIComponent(q)}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(json) || `Lookup failed: ${res.status}`);
    }

    const json = await res.json();
    if (!json.success) throw new Error(extractErrorMessage(json));

    const data: Record<string, string> = json?.data || {};
    return Object.entries(data)
      .slice(0, 15)
      .map(([number, name]) => ({
        id: number,
        number,
        name,
        origin: { code: '', name: '' },
        destination: { code: '', name: '' },
      }));
  } catch (err) {
    console.warn('RailRadar lookup API fetch failed, using local DB fallback');
    return searchLocalTrains(q).map((t) => ({
      id: t.number,
      number: t.number,
      name: t.name,
      origin: { code: t.fromCode, name: t.from },
      destination: { code: t.toCode, name: t.to },
    }));
  }
}

export type LiveJourneyResult =
  | { ok: true; journey: LiveJourney; dataSource: Extract<DataSource, 'live' | 'fallback'> }
  | {
      ok: false;
      dataSource: 'unavailable';
      error: string;
      status: number;
      code: 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'UNAVAILABLE';
    };

function unavailable(
  error: string,
  status: number,
  code: 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'UNAVAILABLE'
): LiveJourneyResult {
  return { ok: false, dataSource: 'unavailable', error, status, code };
}

function allowDevFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

let liveFetchCount = 0;

export function getLiveFetchCount(): number {
  return liveFetchCount;
}

export function resetLiveFetchCount(): void {
  liveFetchCount = 0;
}

export async function getLiveJourney(trainNumber: string): Promise<LiveJourneyResult> {
  liveFetchCount += 1;
  console.info(`[getLiveJourney] RailRadar fetch #${liveFetchCount} for train ${trainNumber}`);
  if (!env.RAILRADAR_API_KEY) {
    if (allowDevFallback()) {
      const fallback = generateFallbackJourney(trainNumber);
      if (fallback) return { ok: true, journey: fallback, dataSource: 'fallback' };
    }
    return unavailable('RAILRADAR_API_KEY is not configured', 503, 'UNAVAILABLE');
  }

  try {
    const [liveRes, routeGeo] = await Promise.all([
      rrFetch(`${RR_BASE}/trains/${trainNumber}/live`, { cache: 'no-store' } as any),
      fetchRouteGeometry(trainNumber),
    ]);

    const json = await liveRes.json().catch(() => null);

    if (!liveRes.ok) {
      if (liveRes.status === 404) {
        return unavailable('Live journey not found for train', 404, 'NOT_FOUND');
      }
      const msg = extractErrorMessage(json);
      if (liveRes.status === 429 || json?.error?.code === 'TOO_MANY_REQUESTS') {
        return unavailable(`QUOTA_EXCEEDED: ${msg}`, 429, 'QUOTA_EXCEEDED');
      }
      throw new Error(`RailRadar API error (${liveRes.status}): ${msg}`);
    }

    if (!json?.success || !json?.data) {
      const msg = extractErrorMessage(json);
      if (json?.error?.code === 'TOO_MANY_REQUESTS') {
        return unavailable(`QUOTA_EXCEEDED: ${msg}`, 429, 'QUOTA_EXCEEDED');
      }
      return unavailable(msg || 'Live journey not found for train', 404, 'NOT_FOUND');
    }

    return {
      ok: true,
      journey: normaliseLiveResponse(json.data as RRLiveResponse, routeGeo),
      dataSource: 'live',
    };
  } catch (err: any) {
    if (err?.message?.includes('QUOTA_EXCEEDED')) {
      return unavailable(err.message, 429, 'QUOTA_EXCEEDED');
    }

    console.warn(`[getLiveJourney] RailRadar API error for train ${trainNumber}:`, err.message);

    if (allowDevFallback()) {
      const fallback = generateFallbackJourney(trainNumber);
      if (fallback) return { ok: true, journey: fallback, dataSource: 'fallback' };
    }

    return unavailable(
      err?.message || 'Live train data is currently unavailable',
      503,
      'UNAVAILABLE'
    );
  }
}
