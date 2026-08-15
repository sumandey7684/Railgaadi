import { describe, expect, it } from 'vitest';
import { normaliseLiveResponse, type RRLiveResponse } from '@/lib/railradar';

const source = { code: 'MMCT', name: 'Mumbai Central', lat: 18.97, lng: 72.82 };
const dest = { code: 'NDLS', name: 'New Delhi', lat: 28.64, lng: 77.22 };

function baseLive(overrides: Partial<RRLiveResponse> = {}): RRLiveResponse {
  return {
    trainNumber: '12951',
    trainName: 'Rajdhani',
    startDate: '2026-01-01',
    lastUpdatedAt: '2026-01-01T12:00:00.000Z',
    status: 'running',
    isLive: true,
    trackingMode: 'live',
    delayMinutes: 10,
    train: {
      number: '12951',
      name: 'Rajdhani',
      type: 'Rajdhani',
      category: 'Mail/Express',
      source,
      destination: dest,
      runDays: ['Daily'],
      distance: 1384,
      duration: 900,
      avgSpeed: 90,
    },
    currentLocation: {
      stationCode: 'BRC',
      sequence: 2,
      status: 'at-station',
      isHalt: true,
      isActualPosition: true,
      lat: 22.3,
      lng: 73.2,
    },
    nextHalt: {
      stationCode: 'NDLS',
      stationName: 'New Delhi',
      sequence: 3,
      distance: 1384,
    },
    route: [
      {
        sequence: 1,
        stationCode: 'MMCT',
        stationName: 'Mumbai Central',
        isHalt: true,
        scheduledArrival: '16:00',
        scheduledDeparture: '16:00',
        actualArrival: '16:00',
        actualDeparture: '16:05',
        delayArrival: 0,
        distance: 0,
        status: 'departed',
        station: source,
      },
      {
        sequence: 2,
        stationCode: 'BRC',
        stationName: 'Vadodara',
        isHalt: true,
        scheduledArrival: '20:00',
        scheduledDeparture: '20:05',
        actualArrival: '20:10',
        delayArrival: 10,
        distance: 400,
        status: 'at-station',
        station: { code: 'BRC', name: 'Vadodara', lat: 22.3, lng: 73.2 },
      },
      {
        sequence: 3,
        stationCode: 'NDLS',
        stationName: 'New Delhi',
        isHalt: true,
        scheduledArrival: '08:00',
        scheduledDeparture: '08:00',
        distance: 1384,
        status: 'upcoming',
        station: dest,
      },
    ],
    ...overrides,
  };
}

describe('railradar normaliseLiveResponse', () => {
  it('normalizes a live GPS response', () => {
    const journey = normaliseLiveResponse(baseLive());
    expect(journey.number).toBe('12951');
    expect(journey.currentLocation.source).toBe('gps');
    expect(journey.currentLocation.lat).toBe(22.3);
    expect(journey.currentStation?.code).toBe('BRC');
    expect(journey.previousStation?.code).toBe('MMCT');
    expect(journey.nextHalt?.code).toBe('NDLS');
    expect(journey.delayMinutes).toBe(10);
    expect(journey.progressSource).toBe('station');
  });

  it('uses station position when GPS coords exist but are not actual', () => {
    const journey = normaliseLiveResponse(
      baseLive({
        currentLocation: {
          stationCode: 'BRC',
          sequence: 2,
          status: 'at-station',
          isHalt: true,
          isActualPosition: false,
          lat: 22.3,
          lng: 73.2,
        },
      })
    );
    expect(journey.currentLocation.source).toBe('station');
  });

  it('interpolates position when GPS is missing but route geometry exists', () => {
    const routeGeo: [number, number][] = [
      [72.82, 18.97],
      [73.2, 22.3],
      [77.22, 28.64],
    ];
    const journey = normaliseLiveResponse(
      baseLive({
        currentLocation: {
          stationCode: 'BRC',
          sequence: 2,
          status: 'at-station',
          isHalt: true,
          isActualPosition: false,
        },
      }),
      routeGeo
    );
    // Prefer current halt station coords when present on the halt itself
    expect(['station', 'interpolated']).toContain(journey.currentLocation.source);
    expect(journey.currentLocation.lat).toBeTruthy();
    expect(journey.currentLocation.lng).toBeTruthy();
  });

  it('keeps missing train delay as undefined (no fabricated delay)', () => {
    const journey = normaliseLiveResponse(baseLive({ delayMinutes: undefined as unknown as number }));
    expect(journey.delayMinutes).toBeUndefined();
  });

  it('does not invent GPS when location and geometry are absent', () => {
    const journey = normaliseLiveResponse(
      baseLive({
        currentLocation: undefined,
        route: [
          {
            sequence: 1,
            stationCode: 'MMCT',
            stationName: 'Mumbai Central',
            isHalt: true,
            scheduledArrival: '16:00',
            scheduledDeparture: '16:00',
            distance: 0,
            status: 'departed',
            station: source,
          },
          {
            sequence: 2,
            stationCode: 'NDLS',
            stationName: 'New Delhi',
            isHalt: true,
            scheduledArrival: '08:00',
            scheduledDeparture: '08:00',
            distance: 1384,
            status: 'upcoming',
            station: dest,
          },
        ],
      })
    );
    // Falls back to a known station pin — never invents a fake GPS fix.
    expect(journey.currentLocation.source).not.toBe('gps');
    expect(['station', 'fallback']).toContain(journey.currentLocation.source);
    expect(Number.isFinite(journey.currentLocation.lat)).toBe(true);
    expect(Number.isFinite(journey.currentLocation.lng)).toBe(true);
  });

  it('marks upcoming halt delays as estimated from train delay', () => {
    const journey = normaliseLiveResponse(baseLive({ delayMinutes: 25 }));
    const ndls = journey.stations.find((s) => s.code === 'NDLS');
    expect(ndls?.delayMinutes).toBe(25);
    expect(ndls?.delayEstimated).toBe(true);
    expect(ndls?.arrivalSource).toBe('expected');
  });
});
