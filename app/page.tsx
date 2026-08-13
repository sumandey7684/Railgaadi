'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Train, ArrowRight, Sparkles, Clock, History, MapPin, Zap,
  Search, Loader2, AlertCircle, X
} from 'lucide-react';
import { useTrainSearch } from '@/hooks/useTrainSearch';
import { useSearchStore } from '@/store/search';
import { SearchResult } from '@/types/train';
import { cn } from '@/utils/cn';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recentSearches, addRecentSearch, clearRecentSearches } = useSearchStore();
  const [inputValue, setInputValue] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const debouncedQuery = useDebounce(inputValue, 350);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading, isError } = useTrainSearch(debouncedQuery);

  // Open/focus search from /?search=1 (bottom nav + PWA shortcut)
  useEffect(() => {
    if (searchParams.get('search') === '1') {
      setIsSearchOpen(true);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (train: SearchResult) => {
    addRecentSearch(train);
    setIsSearchOpen(false);
    setInputValue('');
    router.push(`/train/${train.number}`);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const first = searchResults?.[0];
      if (first) handleSelect(first);
      else router.push(`/train/${inputValue.trim()}`);
    }
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isSearchOpen;

  return (
    <div className="space-y-10 py-4">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-rail-blue/15 bg-background p-8 text-center md:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(2,132,199,0.12),transparent_55%)]"
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-3xl"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rail-blue/25 bg-rail-blue/10 px-3.5 py-1 text-xs font-semibold text-rail-blue">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Real-time Indian Railways Intelligence · Powered by RailRadar</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
            Track Any Train in <span className="text-rail-blue">Real-time.</span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Live GPS tracking, delay analytics, route maps, and weather intelligence for every train across India.
          </p>

          {/* ─── Search Input ─── */}
          <div className="mt-8 relative max-w-xl mx-auto text-left">
            {/* Input box */}
            <div
              className={cn(
                'glass-control flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-shadow duration-300',
                isSearchOpen ? 'shadow-glow ring-1 ring-rail-blue/25 !border-rail-blue/40' : ''
              )}
            >
              {isLoading && inputValue ? (
                <Loader2 className="h-5 w-5 flex-shrink-0 text-rail-blue animate-spin" />
              ) : (
                <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              )}

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={handleInputKeyDown}
                placeholder="Enter train number (12951) or name (Rajdhani)..."
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none"
              />

              {inputValue && (
                <button
                  onClick={() => { setInputValue(''); setIsSearchOpen(false); }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground flex-shrink-0">
                ⌘ K
              </kbd>
            </div>

            {/* Search Dropdown */}
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  ref={dropdownRef}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[360px] overflow-y-auto rounded-2xl glass-panel p-3"
                >
                  {/* Error state */}
                  {isError && (
                    <div className="flex items-center gap-2 py-4 text-center justify-center text-xs text-rose-500">
                      <AlertCircle className="h-4 w-4" />
                      <span>Error loading trains. Please try again.</span>
                    </div>
                  )}

                  {/* Loading skeleton */}
                  {isLoading && !searchResults && (
                    <div className="space-y-2 py-1">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-xl bg-muted/70 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {/* No results */}
                  {!isLoading && !isError && searchResults && searchResults.length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No trains found. Try a train number like <strong>12951</strong> or name like <strong>Rajdhani</strong>.
                    </div>
                  )}

                  {/* Direct number search option */}
                  {inputValue && /^\d{4,5}$/.test(inputValue.trim()) && (
                    <button
                      onClick={() => router.push(`/train/${inputValue.trim()}`)}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-2 bg-rail-blue/10 text-rail-blue text-xs font-bold hover:bg-rail-blue hover:text-white transition-all"
                    >
                      <Train className="h-4 w-4" />
                      <span>Track train #{inputValue.trim()} live →</span>
                    </button>
                  )}

                  {/* Results */}
                  {searchResults && searchResults.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">
                        {inputValue ? 'Matching Trains' : 'Popular Trains'}
                      </p>
                      {searchResults.map((train) => (
                        <button
                          key={train.id}
                          onClick={() => handleSelect(train)}
                          className="w-full group flex items-center justify-between rounded-xl border border-transparent p-3 transition-colors duration-150 hover:border-rail-blue/20 hover:bg-rail-blue/5 text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
                              <Train className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground flex-shrink-0">
                                  {train.number}
                                </span>
                                <span className="font-semibold text-foreground text-sm truncate">
                                  {train.name}
                                </span>
                              </div>
                              {(train.origin.name || train.destination.name) && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                                  <span>{train.origin.name} ({train.origin.code})</span>
                                  <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                                  <span>{train.destination.name} ({train.destination.code})</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-rail-blue group-hover:translate-x-0.5 transition-all motion-reduce:group-hover:translate-x-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Chips */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Try:</span>
            {['12951', '22436', '12301', '12621'].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setInputValue(num);
                  setIsSearchOpen(true);
                  inputRef.current?.focus();
                }}
                className="rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1 font-mono font-semibold text-foreground hover:border-rail-blue hover:bg-rail-blue hover:text-white transition-colors"
              >
                {num}
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── Recent Searches ───────────────────────────────────────────────── */}
      {recentSearches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-foreground">
              <History className="h-5 w-5 text-rail-blue" />
              <span>Recent Searches</span>
            </div>
            <button
              onClick={clearRecentSearches}
              className="text-xs font-semibold text-muted-foreground hover:text-rose-500 transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentSearches.map((train) => (
              <Link
                key={train.id}
                href={`/train/${train.number}`}
                className="glass-panel glass-interactive group flex items-center justify-between rounded-2xl p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors flex-shrink-0">
                    <Train className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] font-bold text-rail-blue block">#{train.number}</span>
                    <h4 className="font-bold text-foreground text-sm truncate">{train.name}</h4>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:translate-x-0.5 group-hover:text-rail-blue transition-all motion-reduce:group-hover:translate-x-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Feature Grid ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          {
            icon: <MapPin className="h-6 w-6" />,
            color: 'bg-sky-500/10 text-rail-blue',
            title: 'Vector Map Tracking',
            desc: 'MapTiler dark vector tiles with animated live train marker, route glow, and follow camera.',
          },
          {
            icon: <Zap className="h-6 w-6" />,
            color: 'bg-emerald-500/10 text-emerald-600',
            title: 'Live 30s Auto-Refresh',
            desc: 'TanStack Query polls RailRadar every 30 seconds for position, delay, and ETA updates.',
          },
          {
            icon: <Clock className="h-6 w-6" />,
            color: 'bg-amber-500/10 text-amber-600',
            title: 'OpenWeather & Terrain',
            desc: 'Per-station live weather and OpenTopography SRTM elevation profiles along the route.',
          },
        ].map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * i }}
            className="glass-panel rounded-3xl p-6 space-y-3"
          >
            <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center', f.color)}>
              {f.icon}
            </div>
            <h3 className="font-bold text-lg text-foreground">{f.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
