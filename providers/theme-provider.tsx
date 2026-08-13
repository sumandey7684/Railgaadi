'use client';

import { useEffect } from 'react';
import { applyTheme, readStoredTheme, resolveTheme, THEME_STORAGE_KEY } from '@/lib/theme';

/** Re-applies stored or system theme after hydration and across tabs. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const sync = () => {
      applyTheme(
        resolveTheme(readStoredTheme(), window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    };

    sync();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (!readStoredTheme()) sync();
    };
    media.addEventListener('change', onSystem);

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      media.removeEventListener('change', onSystem);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return <>{children}</>;
}
