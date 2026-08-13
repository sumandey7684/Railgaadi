'use client';

import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Circle, Radio } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import {
  haltStations,
  stationArrivalView,
  stationDepartureView,
  stationScheduledArrival,
  delayLabel,
} from '@/lib/journey-state';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

interface TimelineProps {
  journey: LiveJourney;
  className?: string;
}

export function Timeline({ journey, className }: TimelineProps) {
  const selectedStationCode = useJourneyStore((s) => s.selectedStationCode);
  const setSelectedStationCode = useJourneyStore((s) => s.setSelectedStationCode);
  const setFollowTrainMode = useJourneyStore((s) => s.setFollowTrainMode);
  const currentRef = useRef<HTMLButtonElement>(null);
  const stations = haltStations(journey);
  const currentCode = journey.currentStation?.code;

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentCode]);

  return (
    <div className={cn('glass-panel rounded-3xl p-6', className)}>
      <h3 className="mb-6 text-lg font-bold text-slate-900 dark:text-white">
        Station Route Timeline
      </h3>

      <div className="max-h-[640px] overflow-y-auto overflow-x-hidden pr-1">
        <div className="relative space-y-6 py-1 pl-1 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {stations.map((st, idx) => {
            const isPassed = st.status === 'passed';
            const isCurrent = st.status === 'current';
            const isUpcoming = st.status === 'upcoming';
            const isSelected = selectedStationCode === st.code;
            const arrival = stationArrivalView(st);
            const departure = stationDepartureView(st);
            const scheduled = stationScheduledArrival(st);
            const delay = delayLabel(st);
            const showScheduled =
              arrival.source !== 'scheduled' && scheduled.time !== '—' && scheduled.time !== arrival.time;

            return (
              <button
                key={st.code + idx}
                type="button"
                ref={isCurrent ? currentRef : undefined}
                onClick={() => {
                  setSelectedStationCode(st.code);
                  setFollowTrainMode(false);
                }}
                className={cn(
                  'relative flex w-full items-start gap-3 rounded-xl p-1 text-left transition-colors',
                  isSelected && 'bg-rail-blue/5 ring-1 ring-rail-blue/20'
                )}
              >
                <div className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-background">
                  {isPassed && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />
                  )}
                  {isCurrent && (
                    <div className="relative flex items-center justify-center">
                      <Radio className="h-5 w-5 text-rail-blue animate-pulse" />
                      <span className="absolute h-8 w-8 rounded-full bg-rail-blue/20 animate-ping" />
                    </div>
                  )}
                  {isUpcoming && (
                    <Circle className="h-4 w-4 text-slate-300 dark:text-slate-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4
                      className={cn(
                        'font-bold',
                        isCurrent
                          ? 'text-rail-blue text-base'
                          : isPassed
                          ? 'text-slate-800 dark:text-slate-200 text-sm'
                          : 'text-slate-500 dark:text-slate-400 text-sm'
                      )}
                    >
                      {st.name} ({st.code})
                    </h4>

                    {isCurrent && (
                      <span className="rounded-md bg-rail-blue/10 px-2 py-0.5 font-mono text-[10px] font-bold text-rail-blue">
                        {journey.currentLocation.source === 'gps' ? 'LIVE GPS' : 'AT STATION'}
                      </span>
                    )}

                    {st.platform && (
                      <span className="rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                        PF {st.platform}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span>{st.distanceKm} km</span>
                    {st.haltMinutes ? <span>Halt: {st.haltMinutes}m</span> : null}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right font-mono text-xs">
                  {showScheduled && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      SCH {scheduled.time}
                    </div>
                  )}
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {arrival.label ? `${arrival.label} ` : ''}
                    {arrival.time}
                  </div>
                  {departure.time !== '—' && departure.time !== arrival.time && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {departure.label ? `${departure.label} ` : 'Dep '}
                      {departure.time}
                    </div>
                  )}
                  {delay.known ? (
                    <div
                      className={cn(
                        'text-[11px] font-bold',
                        delay.estimated
                          ? 'text-amber-600 dark:text-amber-400'
                          : st.delayMinutes && st.delayMinutes > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {delay.text}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
