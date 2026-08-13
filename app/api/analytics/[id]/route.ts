import { NextRequest, NextResponse } from 'next/server';
import { loadCachedLiveJourney } from '@/lib/journey-loader';
import { getElevationProfile, ElevationPoint } from '@/lib/opentopography';
import { getCached, setCached } from '@/lib/cache';
import { ApiResponse, DataSource } from '@/types/api';

export interface AnalyticsResponse {
  trainId: string;
  totalDistanceKm: number;
  distanceCoveredKm: number;
  remainingDistanceKm: number;
  completionPercentage: number;
  highestElevationM: number;
  elevationProfile: ElevationPoint[];
  delayHistory: { stationCode: string; stationName: string; delayMinutes: number }[];
}

interface CachedAnalytics {
  result: AnalyticsResponse;
  originSource: DataSource;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const trainId = params.id;
  const cacheKey = `analytics:${trainId}`;

  const cached = getCached<CachedAnalytics>(cacheKey);
  if (cached) {
    const dataSource: DataSource = cached.originSource === 'fallback' ? 'fallback' : 'cached';
    return NextResponse.json<ApiResponse<AnalyticsResponse>>({
      success: true,
      data: cached.result,
      cached: true,
      dataSource,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const journeyResult = await loadCachedLiveJourney(trainId);
    if (!journeyResult.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: journeyResult.error,
          timestamp: new Date().toISOString(),
          dataSource: 'unavailable',
        },
        { status: journeyResult.status }
      );
    }

    const journey = journeyResult.journey;
    const routeCoords = (journey.routeGeometry ||
      journey.stations.map((s) => [s.lng, s.lat] as [number, number])) as [number, number][];
    const elevation = await getElevationProfile(routeCoords, journey.totalDistanceKm);

    const highestElevationM = Math.max(...elevation.data.map((e) => e.elevationM));

    const delayHistory = journey.stations.map((s) => ({
      stationCode: s.code,
      stationName: s.name,
      delayMinutes: s.delayMinutes ?? 0,
    }));

    const result: AnalyticsResponse = {
      trainId,
      totalDistanceKm: journey.totalDistanceKm,
      distanceCoveredKm: journey.distanceCoveredKm,
      remainingDistanceKm: journey.remainingDistanceKm,
      completionPercentage: journey.completionPercentage,
      highestElevationM,
      elevationProfile: elevation.data,
      delayHistory,
    };

    setCached(cacheKey, { result, originSource: elevation.dataSource }, 300);

    return NextResponse.json<ApiResponse<AnalyticsResponse>>({
      success: true,
      data: result,
      cached: false,
      dataSource: elevation.dataSource,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: err.message || 'Failed to compute analytics',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 500 }
    );
  }
}
