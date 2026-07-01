// @demo-start
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Vehicle, AddVehicleRequest } from '@customer/types/api';

interface DemoVehicleState {
  vehicles: Vehicle[];
  /**
   * Backend-created vehicle IDs to clean up on a demo reset. These are NOT
   * filtered out of the garage UI — they show normally until the user taps
   * "Reset Demo Data", at which point we use this list to delete them via
   * the backend.
   *
   * Historical note: this field used to be called `hiddenIds` and the
   * `useVehicles` hook filtered them out of the garage immediately. That
   * meant every newly-added real vehicle vanished from the customer's
   * garage right after a successful add. The persist version below was
   * bumped to v2 to wipe any stale `hiddenIds` left on existing devices.
   */
  trackedIds: number[];
  _nextId: number;
  addDemoVehicle: (params: AddVehicleRequest & { vin?: string }) => Vehicle;
  /** Track a backend-created vehicle so it can be cleaned up on demo reset. */
  trackApiVehicle: (id: number) => void;
  /** Clear local demo vehicles but keep trackedIds (for local-only reset). */
  clear: () => void;
  /** Full reset: clear everything including trackedIds (after successful backend reset). */
  clearAll: () => void;
}

export const useDemoVehicleStore = create<DemoVehicleState>()(
  persist(
    (set, get) => ({
      vehicles: [],
      trackedIds: [],
      _nextId: -100,

      addDemoVehicle: (params) => {
        const id = get()._nextId;
        const now = new Date().toISOString();
        const vehicle: Vehicle = {
          id,
          user_id: 0,
          vin: params.vin ?? null,
          year: params.year ?? null,
          make: params.make ?? null,
          model: params.model ?? null,
          engine: params.engine ?? null,
          license_plate: params.license_plate ?? null,
          license_plate_state: params.license_plate_state ?? null,
          color: params.color ?? null,
          mileage: params.mileage ?? null,
          nickname: null,
          created_at: now,
          updated_at: now,
        };
        set({ vehicles: [...get().vehicles, vehicle], _nextId: id - 1 });
        return vehicle;
      },

      trackApiVehicle: (id) => {
        const current = get().trackedIds;
        if (!current.includes(id)) {
          set({ trackedIds: [...current, id] });
        }
      },

      clear: () => {
        set({ vehicles: [], _nextId: -100 });
      },

      clearAll: () => {
        set({ vehicles: [], trackedIds: [], _nextId: -100 });
      },
    }),
    {
      name: '@demo/vehicles',
      storage: createJSONStorage(() => AsyncStorage),
      // Bump on schema rename: v1 had `hiddenIds` that incorrectly hid live
      // vehicles. v2 uses `trackedIds` (cleanup-only).
      version: 2,
      // Without an explicit `migrate`, zustand refuses to load any state
      // whose stored version doesn't match — it surfaces as the toast
      // "State loaded from storage couldn't be migrated since no migrate
      // function was provided" and leaves the slice undefined, which
      // crashes consumers like More tab that read `trackedIds.length`.
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          const prev = (persistedState ?? {}) as Record<string, unknown>;
          return {
            vehicles: Array.isArray(prev.vehicles) ? (prev.vehicles as Vehicle[]) : [],
            trackedIds: [],
            _nextId: typeof prev._nextId === 'number' ? prev._nextId : -100,
          } as Partial<DemoVehicleState>;
        }
        return persistedState as Partial<DemoVehicleState>;
      },
      partialize: (state) => ({
        vehicles: state.vehicles,
        trackedIds: state.trackedIds,
        _nextId: state._nextId,
      }),
    },
  ),
);
// @demo-end
