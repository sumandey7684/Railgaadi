'use client';

import React from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorCard({ title = 'Something went wrong', message, onRetry }: ErrorCardProps) {
  return (
    <EmptyState
      title={title}
      description={message || 'An unexpected error occurred. Please try again.'}
      action={
        onRetry ? (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
          >
            Try Again
          </button>
        ) : undefined
      }
    />
  );
}
