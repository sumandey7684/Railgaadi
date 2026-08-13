'use client';

import { useQuery } from '@tanstack/react-query';
import { LiveJourney } from '@/types/train';
import { ApiResponse, DataSource } from '@/types/api';
import { useJourneyStore } from '@/store/journey';

export interface LiveJourneyQueryData {
  journey: LiveJourney;
  dataSource: DataSource;
  cached?: boolean;
}

async function fetchLiveJourney(trainId: string): Promise<LiveJourneyQueryData> {
  const res = await fetch(`/api/train/${trainId}`);
  const json: ApiResponse<LiveJourney> = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to fetch live journey');
  }
  return {
    journey: json.data,
    dataSource: json.dataSource || (json.cached ? 'cached' : 'live'),
    cached: json.cached,
  };
}

export function useLiveJourney(trainId: string) {
  const autoRefresh = useJourneyStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['liveJourney', trainId],
    queryFn: () => fetchLiveJourney(trainId),
    enabled: Boolean(trainId),
    refetchInterval: autoRefresh ? 30 * 1000 : false,
    staleTime: 10 * 1000,
  });
}
