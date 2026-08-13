'use client';

import { DataSource } from '@/types/api';
import { cn } from '@/utils/cn';

const CONFIG: Record<DataSource, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  },
  cached: {
    label: 'Cached',
    className: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400',
  },
  fallback: {
    label: 'Fallback / estimated',
    className: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
  },
  unavailable: {
    label: 'Unavailable',
    className: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300',
  },
};

export function DataSourceBadge({
  dataSource,
  className,
}: {
  dataSource?: DataSource;
  className?: string;
}) {
  if (!dataSource) return null;
  const cfg = CONFIG[dataSource];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}
