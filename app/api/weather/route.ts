import { NextRequest, NextResponse } from 'next/server';
import { getWeatherForLocation, WeatherData } from '@/lib/openweather';
import { getCached, setCached } from '@/lib/cache';
import { ApiResponse, DataSource } from '@/types/api';

interface CachedWeather {
  weather: WeatherData;
  originSource: Extract<DataSource, 'live' | 'fallback'>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const name = searchParams.get('name') || '';
  const code = searchParams.get('code') || '';

  if (!lat || !lng) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: 'lat and lng parameters are required',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 400 }
    );
  }

  const cacheKey = `weather:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = getCached<CachedWeather>(cacheKey);
  if (cached) {
    const dataSource: DataSource = cached.originSource === 'fallback' ? 'fallback' : 'cached';
    return NextResponse.json<ApiResponse<WeatherData>>({
      success: true,
      data: cached.weather,
      cached: true,
      dataSource,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const result = await getWeatherForLocation(lat, lng, name, code);
    setCached(cacheKey, { weather: result.data, originSource: result.dataSource }, 900);

    return NextResponse.json<ApiResponse<WeatherData>>({
      success: true,
      data: result.data,
      cached: false,
      dataSource: result.dataSource,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: err.message || 'Weather request failed',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 500 }
    );
  }
}
