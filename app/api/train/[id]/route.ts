import { NextRequest, NextResponse } from 'next/server';
import { loadCachedLiveJourney } from '@/lib/journey-loader';
import { ApiResponse } from '@/types/api';
import { LiveJourney } from '@/types/train';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const trainId = params.id;
  if (!trainId) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: 'Train ID is required',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 400 }
    );
  }

  const result = await loadCachedLiveJourney(trainId);
  if (!result.ok) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: result.status }
    );
  }

  return NextResponse.json<ApiResponse<LiveJourney>>({
    success: true,
    data: result.journey,
    cached: result.cached,
    dataSource: result.dataSource,
    timestamp: new Date().toISOString(),
  });
}
