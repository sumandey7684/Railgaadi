export function formatDelay(minutes?: number | null): { text: string; color: string; badgeBg: string } {
  if (minutes == null) {
    return {
      text: 'Delay unknown',
      color: 'text-slate-500 dark:text-slate-400',
      badgeBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
    };
  }
  if (minutes <= 0) {
    return {
      text: 'On Time',
      color: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    };
  }
  if (minutes < 15) {
    return {
      text: `${minutes}m Late`,
      color: 'text-amber-600 dark:text-amber-400',
      badgeBg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    };
  }
  if (minutes < 60) {
    return {
      text: `${minutes}m Late`,
      color: 'text-rose-600 dark:text-rose-400',
      badgeBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    };
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return {
    text: mins > 0 ? `${hours}h ${mins}m Late` : `${hours}h Late`,
    color: 'text-rose-700 dark:text-rose-400',
    badgeBg: 'bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-600/40',
  };
}

export function formatDistance(km: number): string {
  return `${Math.round(km)} km`;
}

export function formatTimeAgo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
