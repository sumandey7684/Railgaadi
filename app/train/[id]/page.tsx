'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Check, MapPin, CloudSun, Mountain, AlertCircle } from 'lucide-react';
import { useLiveJourney } from '@/hooks/useLiveJourney';
import { JourneyCard } from '@/components/journey/JourneyCard';
import { Timeline } from '@/components/journey/Timeline';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { WeatherPanel } from '@/features/weather/WeatherPanel';
import { AnalyticsDashboard } from '@/features/analytics/AnalyticsDashboard';
import { TerrainPanel } from '@/features/terrain/TerrainPanel';
import { MobileJourneySummary } from '@/components/layout/MobileJourneySummary';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { AutoRefreshToggle } from '@/components/journey/AutoRefreshToggle';
import { cn } from '@/utils/cn';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/features/maps/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-3xl bg-slate-900/30">
      <Skeleton className="h-full w-full rounded-3xl" />
    </div>
  ),
});

const TABS = [
  { id: 'map', label: 'Live Map', icon: MapPin },
  { id: 'weather', label: 'Weather', icon: CloudSun },
  { id: 'analytics', label: 'Terrain & Analytics', icon: Mountain },
] as const;

type TabId = typeof TABS[number]['id'];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  running: {
    label: 'Running',
    color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500 animate-pulse',
  },
  not_started: {
    label: 'Not Started',
    color: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  completed: {
    label: 'Journey Complete',
    color: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
};

export default function TrainJourneyPage({ params }: { params: { id: string } }) {
  const trainId = params.id;
  const { data, isLoading, isError, error, refetch, isRefetching } = useLiveJourney(trainId);
  const journey = data?.journey;
  const dataSource = data?.dataSource;
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('map');

  const handleShare = () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/share/${encodeURIComponent(trainId)}`;
    if (typeof navigator.share === 'function') {
      navigator
        .share({ title: `RailGaadi – ${journey?.name || `Train #${trainId}`}`, url: shareUrl })
        .catch(() => {
          navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-12 w-80 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-[480px] rounded-3xl" />
          <Skeleton className="lg:col-span-5 h-[480px] rounded-3xl" />
        </div>
      </div>
    );
  }

  if (isError || !journey) {
    const errMsg = (error as Error)?.message || '';
    const isQuotaError = errMsg.includes('QUOTA_EXCEEDED') || errMsg.includes('TOO_MANY_REQUESTS') || errMsg.includes('Daily quota');
    const isRateLimited = errMsg.includes('RATE_LIMITED');
    const is404 = errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('NOT_FOUND');

    return (
      <div className="py-12 max-w-xl mx-auto space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rail-blue transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>

        {isQuotaError ? (
          <div className="glass-panel rounded-3xl p-8 text-center space-y-4 border border-amber-500/20">
            <div className="text-4xl">⏳</div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">API Quota Reached</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              The RailRadar free tier allows <strong>50 requests/day</strong>. The daily quota has been exhausted.
              Live tracking will resume tomorrow, or you can upgrade your RailRadar plan.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="https://railradar.in/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
              >
                Upgrade API Plan
              </a>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Back to Search
              </Link>
            </div>
          </div>
        ) : (
          <ErrorCard
            title={
              isRateLimited ? 'Too Many Requests' : is404 ? 'Train Not Found' : 'Live Data Unavailable'
            }
            message={
              isRateLimited
                ? 'This app is receiving too many API requests from your network. Please wait a moment and try again.'
                : is404
                ? `Train #${trainId} not found. Please check the train number.`
                : `Could not load live data for train #${trainId}. The train may not be running today or the service is temporarily unavailable.`
            }
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[journey.status] || STATUS_CONFIG.running;

  // Build a lean SearchResult-compatible object for FavoriteButton
  const trainForFavorite = {
    id: journey.trainId,
    number: journey.number,
    name: journey.name,
    origin: journey.origin,
    destination: journey.destination,
  };

  return (
    <div className="space-y-4 py-2">
      {/* ─── Top Bar ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold', statusCfg.color)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dot)} />
            {statusCfg.label}
          </span>
          <DataSourceBadge dataSource={dataSource} />
          <AutoRefreshToggle compact />

          {/* Favorite */}
          <FavoriteButton train={trainForFavorite} />

          {/* Share */}
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-3.5 py-2 text-xs font-semibold text-white shadow-glow transition-all hover:bg-sky-600 active:scale-95"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* ─── Mobile Journey Summary ─── */}
      <MobileJourneySummary journey={journey} />

      {/* ─── Hero Journey Card (desktop) ─── */}
      <div className="hidden md:block">
        <JourneyCard
          journey={journey}
          dataSource={dataSource}
          onRefresh={() => refetch()}
          isRefreshing={isRefetching}
        />
      </div>

      {dataSource === 'fallback' && (
        <div className="glass-panel flex items-center gap-3 rounded-2xl p-4 border border-amber-500/20">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Estimated sample data for local development. This is not a live train position.
          </p>
        </div>
      )}

      {/* ─── Not-Started / Cancelled Banner ─── */}
      {(journey.status === 'not_started' || journey.status === 'cancelled') && (
        <div className="glass-panel flex items-center gap-3 rounded-2xl p-4 border border-amber-500/20">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {journey.status === 'not_started'
              ? `Train #${journey.number} hasn't departed yet. Live tracking activates once the journey begins (scheduled departure: ${journey.stations[0]?.scheduledDeparture || 'check timetable'}).`
              : `Train #${journey.number} has been cancelled. Please check NTES for alternate arrangements.`}
          </p>
        </div>
      )}

      {/* ─── Tab Selector ─── */}
      <div className="flex items-center gap-1.5 rounded-2xl glass-panel p-1.5 shadow-glass w-fit flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 whitespace-nowrap',
              activeTab === id
                ? 'bg-rail-blue text-white shadow-glow'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ─── Main Content ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active feature panel */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {activeTab === 'map' && <MapView journey={journey} className="h-[480px] w-full" />}
          {activeTab === 'weather' && <WeatherPanel journey={journey} />}
          {activeTab === 'analytics' && (
            <>
              <AnalyticsDashboard journey={journey} />
              <TerrainPanel trainId={journey.trainId} />
            </>
          )}
        </div>

        {/* Route Timeline */}
        <div className="lg:col-span-5 xl:col-span-4">
          <Timeline journey={journey} />
        </div>
      </div>
    </div>
  );
}
