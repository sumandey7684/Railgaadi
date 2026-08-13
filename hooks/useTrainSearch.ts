'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchLocalTrains } from '@/lib/trains-db';
import { SearchResult } from '@/types/train';
import { ApiResponse } from '@/types/api';

function toSearchResults(query: string): SearchResult[] {
  return searchLocalTrains(query).map((t) => ({
    id: t.number,
    number: t.number,
    name: t.name,
    origin: { code: t.fromCode, name: t.from },
    destination: { code: t.toCode, name: t.to },
  }));
}

async function fetchRemoteSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
  const json: ApiResponse<SearchResult[]> = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Search failed');
  }
  const needle = query.trim().toLowerCase();
  return json.data.filter(
    (t) => t.number.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)
  );
}

/**
 * Instant local TRAINS_DB results. RailRadar is queried only when local search
 * has no matches for a non-numeric query (avoids burning live-tracking quota).
 */
export function useTrainSearch(query: string) {
  const local = useMemo(() => toSearchResults(query), [query]);
  const q = query.trim();
  const isTrainNumber = /^\d{4,5}$/.test(q);
  const shouldFetchRemote = q.length >= 3 && local.length === 0 && !isTrainNumber;

  const remote = useQuery({
    queryKey: ['trainSearch', q],
    queryFn: () => fetchRemoteSearch(q),
    enabled: shouldFetchRemote,
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });

  if (!shouldFetchRemote) {
    return {
      data: local,
      isLoading: false,
      isError: false,
      error: null,
    };
  }

  return {
    data: remote.data ?? local,
    isLoading: remote.isLoading,
    isError: remote.isError,
    error: remote.error,
  };
}
