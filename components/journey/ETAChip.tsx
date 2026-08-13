import React from 'react';
import { Navigation } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ETAChipProps {
  eta: string;
  estimated?: boolean;
  className?: string;
}

export function ETAChip({ eta, estimated, className }: ETAChipProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border border-border/70 bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground',
        className
      )}
    >
      <Navigation className="h-3.5 w-3.5 text-rail-blue animate-pulse motion-reduce:animate-none" />
      <span>ETA: {eta}</span>
      {estimated && (
        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400">
          EXP
        </span>
      )}
    </div>
  );
}
