import React from 'react';
import { PackageOpen } from 'lucide-react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('glass-panel flex flex-col items-center justify-center rounded-3xl p-12 text-center space-y-4', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/50 text-muted-foreground">
        <PackageOpen className="h-8 w-8" />
      </div>
      {title && (
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
