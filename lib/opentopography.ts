import { env } from '@/config/env';
import { haversineKm, LngLat, sampleRoute } from '@/lib/geo';

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  stationName?: string;
}

const SAMPLE_COUNT = 8;
const BBOX_PAD_DEG = 0.012;
const CONCURRENCY = 4;

function syntheticElevation(points: LngLat[], totalDistanceKm: number): ElevationPoint[] {
  const stepCount = Math.max(points.length, 10);
  const stepDistance = totalDistanceKm / (stepCount - 1);

  return Array.from({ length: stepCount }).map((_, idx) => {
    const dist = Math.round(idx * stepDistance);
    const baseElev = 45;
    const peakEffect = Math.sin((idx / stepCount) * Math.PI) * 480;
    const noise = Math.sin(idx * 1.5) * 25;
    return {
      distanceKm: dist,
      elevationM: Math.round(Math.max(15, baseElev + peakEffect + noise)),
    };
  });
}

interface AsciiGrid {
  ncols: number;
  nrows: number;
  xll: number;
  yll: number;
  cellsize: number;
  nodata: number;
  values: number[];
}

function parseAsciiGrid(text: string): AsciiGrid | null {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 6) return null;

  const header: Record<string, number> = {};
  let dataStart = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 2 && Number.isNaN(Number(parts[0]))) {
      header[parts[0].toLowerCase()] = parseFloat(parts[1]);
      dataStart = i + 1;
    } else {
      break;
    }
  }

  const ncols = header.ncols;
  const nrows = header.nrows;
  const cellsize = header.cellsize;
  if (!ncols || !nrows || !cellsize) return null;

  const xll = header.xllcorner ?? (header.xllcenter !== undefined ? header.xllcenter - cellsize / 2 : undefined);
  const yll = header.yllcorner ?? (header.yllcenter !== undefined ? header.yllcenter - cellsize / 2 : undefined);
  if (xll === undefined || yll === undefined) return null;

  const nodata = header.nodata_value ?? -9999;
  const values: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    for (const token of lines[i].trim().split(/\s+/)) {
      if (token) values.push(parseFloat(token));
    }
  }

  if (values.length < ncols * nrows) return null;
  return { ncols, nrows, xll, yll, cellsize, nodata, values };
}

function elevationAt(grid: AsciiGrid, lat: number, lng: number): number | null {
  const col = Math.floor((lng - grid.xll) / grid.cellsize);
  const rowFromSouth = Math.floor((lat - grid.yll) / grid.cellsize);
  const row = grid.nrows - 1 - rowFromSouth;
  if (col < 0 || col >= grid.ncols || row < 0 || row >= grid.nrows) return null;
  const value = grid.values[row * grid.ncols + col];
  if (!Number.isFinite(value) || value === grid.nodata) return null;
  return value;
}

async function fetchPointElevation(lng: number, lat: number): Promise<number | null> {
  const south = lat - BBOX_PAD_DEG;
  const north = lat + BBOX_PAD_DEG;
  const west = lng - BBOX_PAD_DEG;
  const east = lng + BBOX_PAD_DEG;
  const url =
    `https://portal.opentopography.org/API/globaldem?demtype=SRTMGL3` +
    `&south=${south}&north=${north}&west=${west}&east=${east}` +
    `&outputFormat=AAIGrid&API_Key=${encodeURIComponent(env.OPENTOPOGRAPHY_API_KEY)}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenTopography ${res.status}: ${errText.slice(0, 180)}`);
  }

  const text = await res.text();
  if (text.includes('<error>') || text.trim().startsWith('{')) {
    throw new Error(`OpenTopography error body: ${text.slice(0, 180)}`);
  }

  const grid = parseAsciiGrid(text);
  if (!grid) return null;
  return elevationAt(grid, lat, lng);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function getElevationProfile(
  points: LngLat[],
  totalDistanceKm: number
): Promise<{ data: ElevationPoint[]; dataSource: 'live' | 'fallback' }> {
  if (!env.OPENTOPOGRAPHY_API_KEY || points.length === 0) {
    return { dataSource: 'fallback', data: syntheticElevation(points, totalDistanceKm) };
  }

  try {
    const samples = sampleRoute(points, SAMPLE_COUNT);
    const elevations = await mapPool(samples, CONCURRENCY, async ([lng, lat]) => {
      try {
        return await fetchPointElevation(lng, lat);
      } catch (err) {
        console.warn('OpenTopography sample failed', err);
        return null;
      }
    });

    const livePoints: ElevationPoint[] = [];
    let covered = 0;
    for (let i = 0; i < samples.length; i++) {
      if (i > 0) covered += haversineKm(samples[i - 1], samples[i]);
      const elev = elevations[i];
      if (elev == null) continue;
      livePoints.push({
        distanceKm: Math.round(covered),
        elevationM: Math.round(elev),
      });
    }

    if (livePoints.length >= 4) {
      if (totalDistanceKm > 0 && livePoints.length > 1) {
        const last = livePoints[livePoints.length - 1].distanceKm || 1;
        livePoints.forEach((p) => {
          p.distanceKm = Math.round((p.distanceKm / last) * totalDistanceKm);
        });
      }
      return { dataSource: 'live', data: livePoints };
    }
  } catch (e) {
    console.warn('OpenTopography elevation API call failed, using topographical model', e);
  }

  return { dataSource: 'fallback', data: syntheticElevation(points, totalDistanceKm) };
}
