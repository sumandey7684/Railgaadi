'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, Activity, Route, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { LiveJourney } from '@/types/train';
import { AnalyticsResponse } from '@/app/api/analytics/[id]/route';
import { ElevationProfile } from './ElevationProfile';
import { formatDelay } from '@/utils/format';
import { cn } from '@/utils/cn';
import { DataSource } from '@/types/api';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

interface AnalyticsDashboardProps {
  journey: LiveJourney;
}

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 800;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span className="font-mono text-2xl font-extrabold text-slate-900 dark:text-white">
      {display.toLocaleString()}{suffix}
    </span>
  );
}

export function AnalyticsDashboard({ journey }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/${journey.trainId}`);
        const json = await res.json();
        if (json.data) {
          setAnalytics(json.data);
          setDataSource(json.dataSource);
        }
      } catch (e) {
        console.warn('Failed to load analytics', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [journey.trainId]);

  const delayInfo = formatDelay(journey.delayMinutes);

  if (loading || !analytics) {
    return (
      <div className="space-y-4">
        <div className="glass-panel rounded-2xl p-5 text-xs text-slate-400 text-center">
          Computing journey analytics & elevation profile from OpenTopography…
        </div>
      </div>
    );
  }

  // Delay history for mini bar chart
  const delayData = analytics.delayHistory.filter((d) => d.delayMinutes >= 0);
  const maxDelay = Math.max(...delayData.map((d) => d.delayMinutes), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <DataSourceBadge dataSource={dataSource} />
      </div>
      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Route, color: 'text-rail-blue', bg: 'bg-rail-blue/10', label: 'Total Distance', value: analytics.totalDistanceKm, suffix: ' km' },
          { icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Highest Point', value: analytics.highestElevationM, suffix: ' m' },
          { icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Covered', value: analytics.distanceCoveredKm, suffix: ' km' },
          { icon: Clock, color: 'text-rose-500', bg: 'bg-rose-500/10', label: 'Delay', value: journey.delayMinutes ?? 0, suffix: ' min' },
        ].map(({ icon: Icon, color, bg, label, value, suffix }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-4 space-y-1"
          >
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', bg)}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <AnimatedCounter value={value} suffix={suffix} />
          </motion.div>
        ))}
      </div>

      {/* ─── Elevation Profile ─── */}
      <ElevationProfile data={analytics.elevationProfile} highestElevationM={analytics.highestElevationM} />

      {/* ─── Delay Bar Chart ─── */}
      <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-500" />
            Per-Station Delay History
          </h3>
          <span className={cn('text-xs font-bold', delayInfo.color)}>{delayInfo.text}</span>
        </div>

        {delayData.length > 0 ? (
          <div className="space-y-2">
            {delayData.slice(0, 12).map((d, i) => {
              const widthPct = maxDelay > 0 ? Math.round((d.delayMinutes / maxDelay) * 100) : 0;
              const barColor =
                d.delayMinutes === 0
                  ? 'bg-emerald-500'
                  : d.delayMinutes < 15
                  ? 'bg-amber-400'
                  : 'bg-rose-500';

              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-28 truncate text-[11px] text-slate-500 dark:text-slate-400 text-right font-mono flex-shrink-0">
                    {d.stationCode}
                  </span>
                  <div className="flex-1 h-4 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(widthPct, d.delayMinutes === 0 ? 4 : 0)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.04 }}
                      className={cn('h-full rounded-full', barColor)}
                    />
                  </div>
                  <span className="w-14 text-[11px] font-mono font-semibold text-right flex-shrink-0 text-slate-700 dark:text-slate-200">
                    {d.delayMinutes > 0 ? `+${d.delayMinutes}m` : 'On time'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No delay history available.</p>
        )}
      </div>
    </div>
  );
}
