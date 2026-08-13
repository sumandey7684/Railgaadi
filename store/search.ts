import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SearchResult } from '@/types/train';

interface SearchState {
  recentSearches: SearchResult[];
  addRecentSearch: (train: SearchResult) => void;
  clearRecentSearches: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recentSearches: [],
      addRecentSearch: (train) =>
        set((state) => {
          const filtered = state.recentSearches.filter(
            (t) => t.id !== train.id && t.number !== train.number
          );
          return { recentSearches: [train, ...filtered].slice(0, 6) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'railgaadi-recent-searches',
    }
  )
);
