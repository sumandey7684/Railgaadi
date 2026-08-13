'use client';

import React from 'react';
import { Gauge, MapPin, RefreshCw, ArrowRight } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import { DelayBadge } from './DelayBadge';
import { ProgressRing } from './ProgressRing';
import { ETAChip } from './ETAChip';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { currentHalt, nextHalt, previousHalt, journeyProgress } from '@/lib/journey-state';
import { formatDistance, formatTimeAgo } from '@/utils/format';
import { DataSource } from '@/types/api';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

interface JourneyCardProps {
  journey: LiveJourney;
  dataSource?: DataSource;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function JourneyCard({
  journey,
  dataSource,
  onRefresh,
  isRefreshing,
  className,
}: JourneyCardProps) {
  const autoRefresh = useJourneyStore((state) => state.autoRefresh);
  const current = currentHalt(journey);
  const previous = previousHalt(journey);
  const next = nextHalt(journey);
  const progress = journeyProgress(journey);
  const atStation = Boolean(current);
  const speedIsTypical = journey.speedSource === 'average' || (!journey.speedKmh && journey.typicalSpeedKmh);
  const speedValue = journey.speedSource === 'live' ? journey.speedKmh : journey.typicalSpeedKmh;
  const positionNote =
    journey.currentLocation.source === 'gps'
      ? 'GPS position'
      : journey.currentLocation.source === 'interpolated'
      ? 'Estimated position'
      : journey.currentLocation.source === 'fallback'
      ? 'Estimated data · not a live GPS position'
      : 'Station position';

  return (
    <div
      className={cn(
        'glass-panel relative overflow-hidden rounded-3xl p-6 shadow-glass transition-all duration-300',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-rail-blue/10 px-2.5 py-1 font-mono text-xs font-bold text-rail-blue">
              #{journey.number}
            </span>
            <DelayBadge delayMinutes={journey.delayMinutes} />
            <DataSourceBadge dataSource={dataSource} />
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {journey.name}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{journey.origin.name} ({journey.origin.code})</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <span>{journey.destination.name} ({journey.destination.code})</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ETAChip eta={journey.ETA} estimated={journey.etaEstimated} />
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/80 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Refresh Live Status"
            >
              <RefreshCw
                className={cn('h-4 w-4', isRefreshing && 'animate-spin text-rail-blue')}
              />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {atStation ? 'Current Halt' : 'Last Halt'}
            </span>
            <p className="font-semibold text-slate-900 dark:text-white truncate">
              {current?.name || previous?.name || 'In Transit'}
            </p>
            {next && (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                Next: {next.name}
                {next.platform ? ` · PF ${next.platform}` : ''}
              </span>
            )}
            {current?.platform && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Platform {current.platform}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {journey.speedSource === 'live' ? 'Live Speed' : speedIsTypical ? 'Typical Speed' : 'Speed'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-xl font-bold text-slate-900 dark:text-white">
                {speedValue != null ? speedValue : '—'}
              </span>
              {speedValue != null && (
                <span className="text-xs font-semibold text-slate-500">km/h</span>
              )}
            </div>
            {speedIsTypical && speedValue != null && (
              <span className="text-[10px] text-slate-400">Catalog average · not live</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Distance Covered
            </span>
            <p className="font-mono text-base font-bold text-slate-900 dark:text-white">
              {formatDistance(progress.coveredKm)} / {formatDistance(progress.totalKm)}
            </p>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatDistance(progress.remainingKm)} remaining
            </span>
          </div>
          <ProgressRing progress={progress.pct} size={54} strokeWidth={5} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>
          {dataSource === 'fallback'
            ? 'Estimated data · not a live GPS position'
            : autoRefresh
            ? dataSource === 'cached'
              ? `Cached snapshot · ${positionNote}`
              : positionNote
            : `Auto-refresh paused · ${positionNote}`}
        </span>
        <span>Updated {formatTimeAgo(journey.lastUpdated)}</span>
      </div>
    </div>
  );
}
