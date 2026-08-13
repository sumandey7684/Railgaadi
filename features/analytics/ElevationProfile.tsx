'use client';

import React from 'react';
import { Mountain, TrendingUp } from 'lucide-react';
import { ElevationPoint } from '@/lib/opentopography';

interface ElevationProfileProps {
  data: ElevationPoint[];
  highestElevationM: number;
}

export function ElevationProfile({ data, highestElevationM }: ElevationProfileProps) {
  if (!data || data.length === 0) return null;

  const maxElev = Math.max(...data.map((d) => d.elevationM), 100);
  const minElev = Math.min(...data.map((d) => d.elevationM), 0);
  const range = maxElev - minElev || 1;

  // Build SVG path string
  const svgWidth = 600;
  const svgHeight = 160;
  const pointsString = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * svgWidth;
      const y = svgHeight - ((d.elevationM - minElev) / range) * (svgHeight - 40) - 20;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPath = `M 0,${svgHeight} L ${pointsString} L ${svgWidth},${svgHeight} Z`;

  return (
    <div className="glass-panel rounded-3xl p-6 shadow-glass space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-slate-900 dark:text-white">
          <Mountain className="h-5 w-5 text-emerald-500" />
          <span>OpenTopography Elevation Profile</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Peak: {highestElevationM}m</span>
        </div>
      </div>

      {/* SVG Terrain Area Chart */}
      <div className="relative h-44 w-full pt-4">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area Fill */}
          <path d={areaPath} fill="url(#elevationGrad)" />

          {/* Stroke Line */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pointsString}
          />
        </svg>
      </div>

      <div className="flex justify-between text-xs font-mono font-semibold text-slate-400">
        <span>0 km (Origin)</span>
        <span>{data[data.length - 1]?.distanceKm} km (Destination)</span>
      </div>
    </div>
  );
}
