'use client';

import React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Train, ArrowRight, MapPin } from 'lucide-react';
import { useFavoritesStore } from '@/store/favorites';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function FavoritesPage() {
  const { favorites } = useFavoritesStore();

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
          <Heart className="h-6 w-6 fill-current" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Favorites</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {favorites.length} saved train{favorites.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Favorites Grid */}
      {favorites.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Heart any train from the live tracking page to save it here for quick access."
          action={
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-rail-blue px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-sky-600 transition-colors"
            >
              <MapPin className="h-4 w-4" />
              Search Trains
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {favorites.map((train, idx) => (
              <motion.div
                key={train.id || train.number}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
              >
                <Link
                  href={`/train/${train.number}`}
                  className="glass-panel group relative flex items-center justify-between rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glass-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rail-blue/10 text-rail-blue group-hover:bg-rail-blue group-hover:text-white transition-colors">
                      <Train className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-bold text-rail-blue block">
                        #{train.number}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                        {train.name}
                      </h3>
                      {train.origin?.name && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="truncate">{train.origin.name}</span>
                          <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">{train.destination.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <FavoriteButton train={train} size="sm" className="flex-shrink-0 ml-2" />
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
