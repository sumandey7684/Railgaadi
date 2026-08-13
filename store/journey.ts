import { create } from 'zustand';

interface JourneyState {
  autoRefresh: boolean;
  followTrainMode: boolean;
  selectedStationCode: string | null;
  toggleAutoRefresh: () => void;
  setFollowTrainMode: (val: boolean) => void;
  setSelectedStationCode: (code: string | null) => void;
}

export const useJourneyStore = create<JourneyState>((set) => ({
  autoRefresh: true,
  followTrainMode: true,
  selectedStationCode: null,
  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
  setFollowTrainMode: (val) => set({ followTrainMode: val }),
  setSelectedStationCode: (code) => set({ selectedStationCode: code }),
}));
