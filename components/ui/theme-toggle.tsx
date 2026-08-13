'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyTheme, getDocumentTheme, persistTheme, type Theme } from '@/lib/theme';

interface ThemeToggleProps {
  className?: string;
}

type ViewTransition = { ready: Promise<void> };

function startCircleSpread(
  event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  next: Theme
) {
  const doc = document as Document & {
    startViewTransition?: (update: () => void) => ViewTransition;
  };

  const apply = () => {
    applyTheme(next);
    persistTheme(next);
  };

  let x = window.innerWidth - 48;
  let y = 48;

  if ('clientX' in event && event.detail !== 0 && (event.clientX || event.clientY)) {
    x = event.clientX;
    y = event.clientY;
  } else if (event.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  if (
    typeof doc.startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply();
    return;
  }

  const transition = doc.startViewTransition(apply);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
        },
        {
          duration: 400,
          easing: 'ease-out',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => {
      apply();
    });
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const sync = () => setIsDark(getDocumentTheme() === 'dark');
    sync();
    window.addEventListener('railgaadi-theme', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('railgaadi-theme', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const next: Theme = isDark ? 'light' : 'dark';
  const label = next === 'dark' ? 'Switch to dark theme' : 'Switch to light theme';

  const onToggle = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    startCircleSpread(event, next);
    setIsDark(!isDark);
  };

  return (
    <div
      className={cn(
        'flex h-8 w-16 cursor-pointer rounded-full border border-border/70 bg-muted/60 p-1 transition-all duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-blue/50',
        className
      )}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(event);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <div className="flex w-full items-center justify-between">
        <div
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full bg-muted transition-transform duration-300',
            'translate-x-8 dark:translate-x-0 dark:bg-secondary'
          )}
        >
          <Sun className="h-4 w-4 text-foreground/80 dark:hidden" strokeWidth={1.5} aria-hidden />
          <Moon className="hidden h-4 w-4 text-foreground dark:block" strokeWidth={1.5} aria-hidden />
        </div>
        <div
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-300',
            '-translate-x-8 dark:translate-x-0 dark:bg-transparent'
          )}
        >
          <Moon className="h-4 w-4 text-foreground dark:hidden" strokeWidth={1.5} aria-hidden />
          <Sun className="hidden h-4 w-4 text-muted-foreground dark:block" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
    </div>
  );
}
