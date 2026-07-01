// @demo-start
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DemoAddressState {
  /** Backend-created address IDs to delete on demo reset. */
  trackedIds: number[];
  trackApiAddress: (id: number) => void;
  clear: () => void;
}

export const useDemoAddressStore = create<DemoAddressState>()(
  persist(
    (set, get) => ({
      trackedIds: [],

      trackApiAddress: (id) => {
        const current = get().trackedIds;
        if (!current.includes(id)) {
          set({ trackedIds: [...current, id] });
        }
      },

      clear: () => set({ trackedIds: [] }),
    }),
    {
      name: '@demo/addresses',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ trackedIds: state.trackedIds }),
    },
  ),
);
// @demo-end
