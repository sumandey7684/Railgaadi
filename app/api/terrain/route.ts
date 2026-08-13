import { NextRequest, NextResponse } from 'next/server';
import { getTerrainFeatures, TerrainFeature } from '@/lib/overpass';
import { loadCachedLiveJourney } from '@/lib/journey-loader';
import { getCached, setCached } from '@/lib/cache';
import { haversineKm } from '@/lib/geo';
import { ApiResponse, DataSource } from '@/types/api';

interface CachedTerrain {
  features: TerrainFeature[];
  originSource: DataSource;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trainId = searchParams.get('trainId');

  if (!trainId) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: 'trainId is required',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 400 }
    );
  }

  const cacheKey = `terrain:${trainId}`;
  const cached = await getCached<CachedTerrain>(cacheKey);
  if (cached) {
    const dataSource: DataSource = cached.originSource === 'fallback' ? 'fallback' : 'cached';
    return NextResponse.json<ApiResponse<TerrainFeature[]>>({
      success: true,
      data: cached.features,
      cached: true,
      dataSource,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const journeyResult = await loadCachedLiveJourney(trainId);
    if (!journeyResult.ok) {
      return NextResponse.json<ApiResponse<TerrainFeature[]>>(
        {
          success: false,
          data: [],
          error: journeyResult.error,
          cached: false,
          dataSource: 'unavailable',
          timestamp: new Date().toISOString(),
        },
        { status: journeyResult.status }
      );
    }

    const journey = journeyResult.journey;
    const routeCoords =
      journey.routeGeometry ||
      journey.stations.filter((s) => s.lat && s.lng).map((s) => [s.lng, s.lat] as [number, number]);

    const result = await getTerrainFeatures(routeCoords);
    const features = result.data;

    const origin = journey.stations[0];
    if (origin?.lat && origin?.lng) {
      features.forEach((f) => {
        f.distanceKm = Math.round(haversineKm([origin.lng, origin.lat], [f.lng, f.lat]));
      });
    }

    features.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    await setCached(cacheKey, { features, originSource: result.dataSource }, 86400);

    return NextResponse.json<ApiResponse<TerrainFeature[]>>({
      success: true,
      data: features,
      cached: false,
      dataSource: result.dataSource,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: err.message || 'Terrain fetch failed',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 500 }
    );
  }
}
