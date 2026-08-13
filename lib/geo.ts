import { along, distance, length, lineString, nearestPointOnLine, point } from '@turf/turf';

export type LngLat = [number, number];

export function haversineKm(a: LngLat, b: LngLat): number {
  return distance(point(a), point(b), { units: 'kilometers' });
}

export function routeLengthKm(coords: LngLat[]): number {
  if (!coords || coords.length < 2) return 0;
  return length(lineString(coords), { units: 'kilometers' });
}

/** Interpolate a [lng, lat] along a polyline using geodesic distance. */
export function interpolateAlongRoute(coords: LngLat[], pct: number): LngLat {
  if (!coords || coords.length === 0) return [77.2194, 28.643];
  if (coords.length === 1 || pct <= 0) return coords[0];
  if (pct >= 100) return coords[coords.length - 1];

  const line = lineString(coords);
  const totalKm = length(line, { units: 'kilometers' });
  if (totalKm === 0) return coords[0];

  const alongPt = along(line, (pct / 100) * totalKm, { units: 'kilometers' });
  return alongPt.geometry.coordinates as LngLat;
}

/** Distance-along-route progress from a known coordinate (GPS or station pin). */
export function progressAlongRoute(
  coords: LngLat[],
  at: LngLat
): { coveredKm: number; totalKm: number; pct: number } | null {
  if (!coords || coords.length < 2) return null;
  const line = lineString(coords);
  const totalKm = length(line, { units: 'kilometers' });
  if (totalKm <= 0) return null;
  const snapped = nearestPointOnLine(line, point(at), { units: 'kilometers' });
  const coveredKm =
    typeof snapped.properties.location === 'number' ? snapped.properties.location : 0;
  const pct = Math.min(100, Math.max(0, (coveredKm / totalKm) * 100));
  return { coveredKm, totalKm, pct };
}

/** Evenly sample a route in geodesic space. */
export function sampleRoute(coords: LngLat[], count: number): LngLat[] {
  if (!coords || coords.length === 0) return [];
  if (coords.length === 1 || count <= 1) return [coords[0]];
  if (coords.length <= count) return coords;

  const line = lineString(coords);
  const totalKm = length(line, { units: 'kilometers' });
  if (totalKm === 0) return [coords[0]];

  const samples: LngLat[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * totalKm;
    samples.push(along(line, d, { units: 'kilometers' }).geometry.coordinates as LngLat);
  }
  return samples;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Split a route into padded corridor bboxes so queries stay local to the track. */
export function corridorBboxes(
  coords: LngLat[],
  options?: { maxSpanDeg?: number; padDeg?: number }
): BBox[] {
  if (!coords.length) return [];

  const maxSpanDeg = options?.maxSpanDeg ?? 2;
  const padDeg = options?.padDeg ?? 0.06;
  const boxes: BBox[] = [];

  let chunk: LngLat[] = [coords[0]];

  const flush = () => {
    if (chunk.length === 0) return;
    const lats = chunk.map(([, lat]) => lat);
    const lngs = chunk.map(([lng]) => lng);
    boxes.push({
      minLat: Math.min(...lats) - padDeg,
      maxLat: Math.max(...lats) + padDeg,
      minLng: Math.min(...lngs) - padDeg,
      maxLng: Math.max(...lngs) + padDeg,
    });
    chunk = [chunk[chunk.length - 1]];
  };

  for (let i = 1; i < coords.length; i++) {
    chunk.push(coords[i]);
    const lats = chunk.map(([, lat]) => lat);
    const lngs = chunk.map(([lng]) => lng);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    if (latSpan > maxSpanDeg || lngSpan > maxSpanDeg) {
      chunk.pop();
      flush();
      chunk.push(coords[i]);
    }
  }
  flush();
  return boxes;
}
