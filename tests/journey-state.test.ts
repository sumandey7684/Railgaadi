import { describe, expect, it } from 'vitest';
import {
  currentHalt,
  delayLabel,
  haltStations,
  isPassengerHalt,
  journeyProgress,
  mapPosition,
  nextHalt,
  previousHalt,
  stationArrivalView,
  stationDepartureView,
  stationScheduledArrival,
} from '@/lib/journey-state';
import type { LiveJourney, Station } from '@/types/train';

function station(partial: Partial<Station> & Pick<Station, 'code' | 'name'>): Station {
  return {
    lat: 0,
    lng: 0,
    scheduledArrival: '10:00',
    scheduledDeparture: '10:05',
    arrivalSource: 'scheduled',
    departureSource: 'scheduled',
    distanceKm: 0,
    status: 'upcoming',
    isHalt: true,
    ...partial,
  };
}

function journey(overrides: Partial<LiveJourney> = {}): LiveJourney {
  const origin = station({ code: 'MMCT', name: 'Mumbai', status: 'passed', distanceKm: 0 });
  const current = station({
    code: 'BRC',
    name: 'Vadodara',
    status: 'current',
    distanceKm: 400,
    actualArrival: '12:00',
    arrivalSource: 'actual',
  });
  const next = station({
    code: 'NDLS',
    name: 'New Delhi',
    status: 'upcoming',
    distanceKm: 1380,
    expectedArrival: '21:30',
    arrivalSource: 'expected',
  });

  return {
    trainId: '12951',
    number: '12951',
    name: 'Rajdhani',
    origin: { code: 'MMCT', name: 'Mumbai' },
    destination: { code: 'NDLS', name: 'New Delhi' },
    currentLocation: { lat: 22.3, lng: 73.2, isMoving: true, source: 'gps' },
    status: 'running',
    speedSource: 'unknown',
    distanceCoveredKm: 400,
    remainingDistanceKm: 980,
    totalDistanceKm: 1380,
    completionPercentage: 29,
    progressSource: 'gps',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    ETA: 'New Delhi at 21:30 (exp.)',
    previousStation: origin,
    currentStation: current,
    nextStation: next,
    nextHalt: next,
    stations: [
      origin,
      station({ code: 'ST', name: 'Surat', isHalt: false, status: 'passed', distanceKm: 200 }),
      current,
      next,
    ],
    ...overrides,
  };
}

describe('journey-state', () => {
  it('detects passenger halts and filters them', () => {
    const j = journey();
    expect(isPassengerHalt(j.stations[1])).toBe(false);
    expect(haltStations(j).map((s) => s.code)).toEqual(['MMCT', 'BRC', 'NDLS']);
  });

  it('resolves current/previous/next halt', () => {
    const j = journey();
    expect(currentHalt(j)?.code).toBe('BRC');
    expect(previousHalt(j)?.code).toBe('MMCT');
    expect(nextHalt(j)?.code).toBe('NDLS');
  });

  it('prefers nextHalt over nextStation', () => {
    const j = journey({
      nextHalt: station({ code: 'HLT', name: 'Halt' }),
      nextStation: station({ code: 'STN', name: 'Station' }),
    });
    expect(nextHalt(j)?.code).toBe('HLT');
  });

  it('labels ACT / EXP / SCH time sources', () => {
    const act = station({
      code: 'A',
      name: 'A',
      arrivalSource: 'actual',
      actualArrival: '11:00',
      departureSource: 'actual',
      actualDeparture: '11:05',
    });
    const exp = station({
      code: 'B',
      name: 'B',
      arrivalSource: 'expected',
      expectedArrival: '12:00',
      departureSource: 'expected',
      expectedDeparture: '12:05',
    });
    const sch = station({
      code: 'C',
      name: 'C',
      arrivalSource: 'scheduled',
      departureSource: 'scheduled',
    });

    expect(stationArrivalView(act)).toMatchObject({ time: '11:00', label: 'ACT' });
    expect(stationDepartureView(act)).toMatchObject({ time: '11:05', label: 'ACT' });
    expect(stationArrivalView(exp)).toMatchObject({ time: '12:00', label: 'EXP' });
    expect(stationDepartureView(exp)).toMatchObject({ time: '12:05', label: 'EXP' });
    expect(stationScheduledArrival(sch)).toMatchObject({ time: '10:00', label: 'SCH' });
  });

  it('handles unknown / missing times', () => {
    const unknown = station({
      code: 'U',
      name: 'U',
      arrivalSource: 'unknown',
      scheduledArrival: '--:--',
    });
    expect(stationArrivalView(unknown)).toMatchObject({ time: '—', label: '', source: 'unknown' });
  });

  it('exposes progress and map position sources', () => {
    const j = journey();
    expect(journeyProgress(j)).toEqual({
      coveredKm: 400,
      remainingKm: 980,
      totalKm: 1380,
      pct: 29,
      source: 'gps',
    });
    expect(mapPosition(j)).toEqual({ lat: 22.3, lng: 73.2, source: 'gps' });

    const stationPos = journey({
      currentLocation: { lat: 1, lng: 2, isMoving: false, source: 'station' },
      progressSource: 'station',
    });
    expect(mapPosition(stationPos).source).toBe('station');
    expect(journeyProgress(stationPos).source).toBe('station');

    const interpolated = journey({
      currentLocation: { lat: 1, lng: 2, isMoving: true, source: 'interpolated' },
      progressSource: 'estimated',
    });
    expect(mapPosition(interpolated).source).toBe('interpolated');
    expect(journeyProgress(interpolated).source).toBe('estimated');
  });

  it('handles unknown and estimated delays', () => {
    expect(delayLabel(station({ code: 'X', name: 'X', delayMinutes: undefined }))).toEqual({
      text: '',
      estimated: false,
      known: false,
    });
    expect(delayLabel(station({ code: 'X', name: 'X', delayMinutes: 0 }))).toEqual({
      text: 'On Time',
      estimated: false,
      known: true,
    });
    expect(
      delayLabel(station({ code: 'X', name: 'X', delayMinutes: 12, delayEstimated: true }))
    ).toEqual({
      text: '+12m est.',
      estimated: true,
      known: true,
    });
  });
});
