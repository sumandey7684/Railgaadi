import { NextRequest, NextResponse } from 'next/server';
import { searchTrains } from '@/lib/railradar';
import { searchLocalTrains } from '@/lib/trains-db';
import { getCached, setCached } from '@/lib/cache';
import { ApiResponse } from '@/types/api';
import { SearchResult } from '@/types/train';

function toSearchResults(query: string): SearchResult[] {
  return searchLocalTrains(query).map((t) => ({
    id: t.number,
    number: t.number,
    name: t.name,
    origin: { code: t.fromCode, name: t.from },
    destination: { code: t.toCode, name: t.to },
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || '';
  const q = query.trim();
  const isTrainNumber = /^\d{4,5}$/.test(q);
  const localResults = toSearchResults(q);

  // Instant TRAINS_DB for empty/popular, local hits, and train numbers.
  // RailRadar lookup is reserved for name queries with no local match.
  if (!q || localResults.length > 0 || isTrainNumber) {
    return NextResponse.json<ApiResponse<SearchResult[]>>({
      success: true,
      data: localResults,
      cached: false,
      dataSource: 'fallback',
      timestamp: new Date().toISOString(),
    });
  }

  const cacheKey = `search:live:${q.toLowerCase()}`;
  const cached = await getCached<SearchResult[]>(cacheKey);
  if (cached) {
    return NextResponse.json<ApiResponse<SearchResult[]>>({
      success: true,
      data: cached,
      cached: true,
      dataSource: 'cached',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const results = await searchTrains(q);
    const needle = q.toLowerCase();
    const matched = results.filter(
      (t) => t.number.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)
    );
    await setCached(cacheKey, matched, 600);

    return NextResponse.json<ApiResponse<SearchResult[]>>({
      success: true,
      data: matched,
      cached: false,
      dataSource: 'live',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.warn('[/api/search] RailRadar search failed, falling back to local DB:', message);
    return NextResponse.json<ApiResponse<SearchResult[]>>({
      success: true,
      data: localResults,
      cached: false,
      dataSource: 'fallback',
      timestamp: new Date().toISOString(),
    });
  }
}
