'use client';

import { Pause, Play } from 'lucide-react';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

export function AutoRefreshToggle({ compact = false }: { compact?: boolean }) {
  const autoRefresh = useJourneyStore((state) => state.autoRefresh);
  const toggleAutoRefresh = useJourneyStore((state) => state.toggleAutoRefresh);

  return (
    <button
      type="button"
      onClick={toggleAutoRefresh}
      aria-pressed={autoRefresh}
      title={autoRefresh ? 'Auto-refresh every 30 seconds' : 'Auto-refresh is paused'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors',
        autoRefresh
          ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/20 dark:text-emerald-400'
          : 'bg-slate-200/60 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400'
      )}
    >
      {autoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      <span>{compact ? (autoRefresh ? '30s' : 'Off') : autoRefresh ? 'Auto 30s' : 'Paused'}</span>
    </button>
  );
}
