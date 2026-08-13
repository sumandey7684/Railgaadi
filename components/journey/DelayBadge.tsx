import React from 'react';
import { Clock } from 'lucide-react';
import { formatDelay } from '@/utils/format';
import { cn } from '@/utils/cn';

interface DelayBadgeProps {
  delayMinutes?: number | null;
  className?: string;
}

export function DelayBadge({ delayMinutes, className }: DelayBadgeProps) {
  const { text, badgeBg } = formatDelay(delayMinutes);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-tight transition-colors',
        badgeBg,
        className
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
