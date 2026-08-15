import { describe, expect, it } from 'vitest';
import {
  corridorBboxes,
  haversineKm,
  interpolateAlongRoute,
  progressAlongRoute,
  routeLengthKm,
  sampleRoute,
  type LngLat,
} from '@/lib/geo';

const mumbai: LngLat = [72.8777, 19.076];
const delhi: LngLat = [77.209, 28.6139];
const route: LngLat[] = [mumbai, [73.8567, 18.5204], [75.8577, 22.7196], delhi];

describe('geo', () => {
  it('computes haversine distance', () => {
    const km = haversineKm(mumbai, delhi);
    expect(km).toBeGreaterThan(1100);
    expect(km).toBeLessThan(1500);
    expect(haversineKm(mumbai, mumbai)).toBeCloseTo(0, 5);
  });

  it('computes route length and handles short routes', () => {
    expect(routeLengthKm([])).toBe(0);
    expect(routeLengthKm([mumbai])).toBe(0);
    expect(routeLengthKm(route)).toBeGreaterThan(1000);
  });

  it('interpolates along a route', () => {
    expect(interpolateAlongRoute([], 50)).toEqual([77.2194, 28.643]);
    expect(interpolateAlongRoute([mumbai], 50)).toEqual(mumbai);
    expect(interpolateAlongRoute(route, 0)).toEqual(mumbai);
    expect(interpolateAlongRoute(route, 100)).toEqual(delhi);

    const mid = interpolateAlongRoute(route, 50);
    expect(mid[0]).toBeGreaterThan(mumbai[0]);
    expect(mid[0]).toBeLessThan(delhi[0]);
  });

  it('computes progress along route from a coordinate', () => {
    expect(progressAlongRoute([], mumbai)).toBeNull();
    expect(progressAlongRoute([mumbai], mumbai)).toBeNull();

    const atStart = progressAlongRoute(route, mumbai);
    expect(atStart).not.toBeNull();
    expect(atStart!.pct).toBeLessThan(5);

    const atEnd = progressAlongRoute(route, delhi);
    expect(atEnd!.pct).toBeGreaterThan(95);
  });

  it('samples a route evenly', () => {
    expect(sampleRoute([], 5)).toEqual([]);
    expect(sampleRoute([mumbai], 5)).toEqual([mumbai]);
    expect(sampleRoute(route, 1)).toEqual([mumbai]);

    // When count >= point count, sampleRoute returns the original polyline.
    expect(sampleRoute(route, 5)).toHaveLength(route.length);

    const dense: LngLat[] = [
      mumbai,
      [73.2, 19.5],
      [74.0, 20.5],
      [75.0, 22.0],
      [76.0, 25.0],
      [76.8, 27.0],
      delhi,
    ];
    const samples = sampleRoute(dense, 5);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual(mumbai);
    expect(samples[4]).toEqual(delhi);
  });

  it('builds corridor bboxes with padding and splitting', () => {
    expect(corridorBboxes([])).toEqual([]);

    const boxes = corridorBboxes(route, { maxSpanDeg: 5, padDeg: 0.1 });
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.maxLat).toBeGreaterThan(box.minLat);
      expect(box.maxLng).toBeGreaterThan(box.minLng);
    }
  });
});
