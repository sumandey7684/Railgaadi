import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SearchResult } from '@/types/train';

interface FavoritesState {
  favorites: SearchResult[];
  addFavorite: (train: SearchResult) => void;
  removeFavorite: (trainId: string) => void;
  isFavorite: (trainId: string) => boolean;
  toggleFavorite: (train: SearchResult) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      addFavorite: (train) =>
        set((state) => ({
          favorites: state.favorites.some((f) => f.id === train.id || f.number === train.number)
            ? state.favorites
            : [train, ...state.favorites],
        })),
      removeFavorite: (trainId) =>
        set((state) => ({
          favorites: state.favorites.filter(
            (f) => f.id !== trainId && f.number !== trainId
          ),
        })),
      isFavorite: (trainId) =>
        get().favorites.some((f) => f.id === trainId || f.number === trainId),
      toggleFavorite: (train) => {
        const isFav = get().isFavorite(train.id || train.number);
        if (isFav) get().removeFavorite(train.id || train.number);
        else get().addFavorite(train);
      },
    }),
    { name: 'railgaadi-favorites' }
  )
);
