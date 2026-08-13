import { getCached, setCached } from '@/lib/cache';
import { getLiveJourney, LiveJourneyResult } from '@/lib/railradar';
import { DataSource } from '@/types/api';
import { LiveJourney } from '@/types/train';

export const LIVE_JOURNEY_TTL_SECONDS = 30;
export const liveJourneyCacheKey = (trainId: string) => `live:${trainId}`;

export interface CachedLiveJourney {
  journey: LiveJourney;
  originSource: Extract<DataSource, 'live' | 'fallback'>;
}

export type LoadedLiveJourney =
  | {
      ok: true;
      journey: LiveJourney;
      dataSource: DataSource;
      originSource: Extract<DataSource, 'live' | 'fallback'>;
      cached: boolean;
    }
  | Extract<LiveJourneyResult, { ok: false }>;

const inflight = new Map<string, Promise<LiveJourneyResult>>();

function fromCache(cached: CachedLiveJourney): LoadedLiveJourney {
  return {
    ok: true,
    journey: cached.journey,
    originSource: cached.originSource,
    dataSource: cached.originSource === 'fallback' ? 'fallback' : 'cached',
    cached: true,
  };
}

/**
 * Single server-side journey path used by train, analytics, and terrain routes.
 * Dedupes in-flight RailRadar fetches and reuses the 30s live cache.
 */
export async function loadCachedLiveJourney(trainId: string): Promise<LoadedLiveJourney> {
  const cacheKey = liveJourneyCacheKey(trainId);
  const cached = getCached<CachedLiveJourney>(cacheKey);
  if (cached) return fromCache(cached);

  let pending = inflight.get(trainId);
  if (!pending) {
    pending = getLiveJourney(trainId).then((result) => {
      if (result.ok) {
        setCached(
          cacheKey,
          { journey: result.journey, originSource: result.dataSource } satisfies CachedLiveJourney,
          LIVE_JOURNEY_TTL_SECONDS
        );
      }
      return result;
    });
    inflight.set(trainId, pending);
    pending.finally(() => inflight.delete(trainId));
  }

  const result = await pending;
  if (!result.ok) return result;

  return {
    ok: true,
    journey: result.journey,
    originSource: result.dataSource,
    dataSource: result.dataSource,
    cached: false,
  };
}
