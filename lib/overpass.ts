import { env } from '@/config/env';
import { corridorBboxes, LngLat, sampleRoute } from '@/lib/geo';

export interface TerrainFeature {
  type: 'bridge' | 'tunnel' | 'river' | 'mountain' | 'tourist' | 'city';
  name: string;
  lat: number;
  lng: number;
  distanceKm?: number;
}

function buildOverpassQuery(boxes: { minLat: number; minLng: number; maxLat: number; maxLng: number }[]): string {
  const selectors = boxes.flatMap(({ minLat, minLng, maxLat, maxLng }) => {
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    return [
      `way["bridge"="yes"](${bbox})`,
      `way["tunnel"="yes"](${bbox})`,
      `way["waterway"="river"](${bbox})`,
      `node["natural"="peak"](${bbox})`,
      `node["tourism"="attraction"](${bbox})`,
      `node["tourism"="viewpoint"](${bbox})`,
      `node["place"="city"](${bbox})`,
      `node["place"="town"](${bbox})`,
    ];
  });

  return `[out:json][timeout:25];
(
  ${selectors.join(';\n  ')};
);
out center tags 40;`;
}

function mapOsmType(tags: Record<string, string>): TerrainFeature['type'] {
  if (tags.bridge === 'yes') return 'bridge';
  if (tags.tunnel === 'yes') return 'tunnel';
  if (tags.waterway === 'river') return 'river';
  if (tags.natural === 'peak') return 'mountain';
  if (tags.tourism === 'attraction' || tags.tourism === 'viewpoint') return 'tourist';
  if (tags.place === 'city' || tags.place === 'town') return 'city';
  return 'tourist';
}

function parseName(tags: Record<string, string>): string {
  return tags['name:en'] || tags.name || tags.description || 'Unnamed feature';
}

function parseFeatures(elements: any[]): TerrainFeature[] {
  const seen = new Set<string>();
  const features: TerrainFeature[] = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    const name = parseName(tags);
    const type = mapOsmType(tags);
    const key = `${type}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    features.push({ type, name, lat, lng });
    if (features.length >= 30) break;
  }

  return features;
}

/**
 * Fetch terrain POIs along a route using Overpass corridor bboxes (not the full route envelope).
 */
export async function getTerrainFeatures(
  routeCoords: LngLat[]
): Promise<{ data: TerrainFeature[]; dataSource: 'live' | 'fallback' | 'unavailable' }> {
  if (!routeCoords || routeCoords.length === 0) {
    return { data: [], dataSource: 'unavailable' };
  }

  const sampled = sampleRoute(routeCoords, 16);
  const boxes = corridorBboxes(sampled, { maxSpanDeg: 2, padDeg: 0.06 });

  try {
    const query = buildOverpassQuery(boxes);
    const res = await fetch(env.OVERPASS_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RailGaadi/0.1 (academic railway tracker)',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);

    const json = await res.json();
    const features = parseFeatures(json?.elements || []);
    if (features.length === 0) {
      return { data: [], dataSource: 'live' };
    }
    return { data: features, dataSource: 'live' };
  } catch (e) {
    console.warn('Overpass terrain fetch failed:', e);

    return {
      dataSource: 'fallback',
      data: [
        { type: 'river', name: 'Tapti River', lat: 21.15, lng: 72.72, distanceKm: 265 },
        { type: 'bridge', name: 'Kota Railway Bridge', lat: 25.18, lng: 75.85, distanceKm: 918 },
        { type: 'mountain', name: 'Aravalli Hills', lat: 24.6, lng: 73.9, distanceKm: 750 },
      ],
    };
  }
}
