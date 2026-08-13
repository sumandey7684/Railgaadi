import React from 'react';
import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70', className)}
    />
  );
}
