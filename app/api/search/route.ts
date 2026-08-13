import { NextRequest, NextResponse } from 'next/server';
import { RailRadarQuotaError, searchTrains } from '@/lib/railradar';
import { searchLocalTrains } from '@/lib/trains-db';
import { getCached, setCached } from '@/lib/cache';
import { ApiResponse, DataSource } from '@/types/api';
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

function ok(
  data: SearchResult[],
  dataSource: DataSource,
  cached = false
): NextResponse<ApiResponse<SearchResult[]>> {
  return NextResponse.json<ApiResponse<SearchResult[]>>({
    success: true,
    data,
    cached,
    dataSource,
    timestamp: new Date().toISOString(),
  });
}

function filterLiveMatches(results: SearchResult[], q: string): SearchResult[] {
  const needle = q.toLowerCase();
  return results.filter(
    (t) => t.number.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)
  );
}

async function liveLookup(
  q: string
): Promise<
  | { kind: 'live'; results: SearchResult[] }
  | { kind: 'cached'; results: SearchResult[] }
  | { kind: 'quota'; error: string }
  | { kind: 'unavailable'; error: string }
> {
  const cacheKey = `search:live:${q.toLowerCase()}`;
  const cached = await getCached<SearchResult[]>(cacheKey);
  if (cached) {
    return { kind: 'cached', results: cached };
  }

  try {
    const results = await searchTrains(q);
    const matched = filterLiveMatches(results, q);
    await setCached(cacheKey, matched, 600);
    return { kind: 'live', results: matched };
  } catch (err: unknown) {
    if (err instanceof RailRadarQuotaError) {
      return { kind: 'quota', error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Search failed';
    console.warn('[/api/search] RailRadar search failed:', message);
    return { kind: 'unavailable', error: message };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || '';
  const q = query.trim();
  const isTrainNumber = /^\d{4,5}$/.test(q);
  const localResults = toSearchResults(q);

  // Empty query → popular local list (never live).
  if (!q) {
    return ok(localResults, 'fallback');
  }

  // Numeric 4–5 digit: local first; only miss hits RailRadar (quota-protected).
  if (isTrainNumber) {
    if (localResults.length > 0) {
      return ok(localResults, 'fallback');
    }

    const live = await liveLookup(q);
    if (live.kind === 'cached') return ok(live.results, 'cached', true);
    if (live.kind === 'live') {
      if (live.results.length === 0) {
        return ok([], 'unavailable');
      }
      return ok(live.results, 'live');
    }
    if (live.kind === 'quota') {
      return NextResponse.json<ApiResponse<SearchResult[]>>(
        {
          success: false,
          data: [],
          error: live.error,
          cached: false,
          dataSource: 'unavailable',
          timestamp: new Date().toISOString(),
        },
        { status: 429 }
      );
    }
    return ok([], 'unavailable');
  }

  // Name queries: local first.
  if (localResults.length > 0) {
    return ok(localResults, 'fallback');
  }

  // No local match → RailRadar when appropriate.
  const live = await liveLookup(q);
  if (live.kind === 'cached') return ok(live.results, 'cached', true);
  if (live.kind === 'live') {
    if (live.results.length === 0) return ok([], 'unavailable');
    return ok(live.results, 'live');
  }
  if (live.kind === 'quota') {
    return NextResponse.json<ApiResponse<SearchResult[]>>(
      {
        success: false,
        data: [],
        error: live.error,
        cached: false,
        dataSource: 'unavailable',
        timestamp: new Date().toISOString(),
      },
      { status: 429 }
    );
  }

  // Provider failed and no local results.
  return ok([], 'unavailable');
}
