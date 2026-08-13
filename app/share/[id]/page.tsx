'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { useLiveJourney } from '@/hooks/useLiveJourney';
import { JourneyCard } from '@/components/journey/JourneyCard';
import { Timeline } from '@/components/journey/Timeline';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { AutoRefreshToggle } from '@/components/journey/AutoRefreshToggle';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/features/maps/MapView'), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full rounded-3xl" />,
});

export default function ShareJourneyPage({ params }: { params: { id: string } }) {
  const trainId = params.id;
  const { data, isLoading, isError, error, refetch, isRefetching } = useLiveJourney(trainId);
  const journey = data?.journey;
  const dataSource = data?.dataSource;

  if (isLoading && !journey) {
    return (
      <div className="py-8 space-y-6">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-[400px] w-full rounded-3xl" />
      </div>
    );
  }

  if (!journey) {
    const errMsg = (error as Error)?.message || '';
    const isQuotaError =
      errMsg.includes('QUOTA_EXCEEDED') ||
      errMsg.includes('TOO_MANY_REQUESTS') ||
      errMsg.includes('Daily quota');
    const isRateLimited = errMsg.includes('RATE_LIMITED');
    const is404 = errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('NOT_FOUND');

    return (
      <div className="py-12 max-w-xl mx-auto space-y-4">
        <ErrorCard
          title={
            isQuotaError
              ? 'Live Data Unavailable'
              : isRateLimited
              ? 'Too Many Requests'
              : is404
              ? 'Train Not Found'
              : 'Shared Journey Unavailable'
          }
          message={
            isQuotaError
              ? `Shared tracking for train #${trainId} is unavailable because the live data quota has been reached.`
              : isRateLimited
              ? 'Too many requests from this network. Please wait a moment and try again.'
              : is404
              ? `Train #${trainId} was not found. The share link may be incorrect.`
              : `Could not load the shared live journey for train #${trainId}.`
          }
          onRetry={() => refetch()}
        />
        <div className="text-center">
          <Link href="/" className="text-xs font-bold text-rail-blue hover:underline">
            Track another train →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-rail-blue/25 bg-rail-blue/5 px-6 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-rail-blue min-w-0">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Public Shared Live Journey Stream</span>
          <DataSourceBadge dataSource={dataSource} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <AutoRefreshToggle compact />
          <Link
            href="/"
            className="text-xs font-bold text-foreground hover:text-rail-blue transition-colors"
          >
            Track another train →
          </Link>
        </div>
      </div>

      {dataSource === 'fallback' && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-foreground">
            This shared view is showing estimated sample data, not a live GPS position.
          </p>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Live update failed. Showing the last known position for this shared journey.
          </p>
        </div>
      )}

      {!isError && dataSource === 'cached' && (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3">
          <p className="text-xs text-muted-foreground">
            Showing a cached snapshot. Live position will refresh shortly.
          </p>
        </div>
      )}

      <JourneyCard
        journey={journey}
        dataSource={dataSource}
        onRefresh={() => refetch()}
        isRefreshing={isRefetching}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <MapView journey={journey} className="h-[420px] w-full" />
        </div>
        <div className="lg:col-span-5">
          <Timeline journey={journey} />
        </div>
      </div>
    </div>
  );
}
