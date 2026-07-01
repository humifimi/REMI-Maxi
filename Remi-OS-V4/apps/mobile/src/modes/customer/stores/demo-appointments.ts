// @demo-start
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Appointment, Service, Vehicle, Address, ScoredSuggestion } from '@customer/types/api';

interface DemoAppointmentState {
  appointments: Appointment[];
  /** Field overrides for backend appointments (positive IDs) that the API can't persist yet. */
  overrides: Record<number, Partial<Appointment>>;
  /** Tracks the next ID to assign so IDs don't collide across sessions. */
  _nextId: number;
  addFromBooking: (params: {
    services: Service[];
    vehicle: Vehicle | null;
    address: Address | null;
    suggestion: ScoredSuggestion | null;
    scheduledDate: string;
    scheduledTime: string;
  }) => number;
  updateAppointment: (id: number, patch: Partial<Appointment>) => void;
  /** Apply a patch to a backend appointment (positive ID) that survives refetches. */
  overrideAppointment: (id: number, patch: Partial<Appointment>) => void;
  removeAppointment: (id: number) => void;
  clear: () => void;
}

export const useDemoAppointmentStore = create<DemoAppointmentState>()(
  persist(
    (set, get) => ({
      appointments: [],
      overrides: {},
      _nextId: -1,

      addFromBooking: ({ services, vehicle, address, suggestion, scheduledDate, scheduledTime }) => {
        const id = get()._nextId;
        const now = new Date().toISOString();

        const appointment: Appointment = {
          id,
          customer_id: 0,
          technician_id: suggestion?.technicianId ?? null,
          vehicle_id: vehicle?.id ?? null,
          address_id: address?.id ?? null,
          franchise_id: 1,
          status: 'confirmed',
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          notes: null,
          cancellation_reason: null,
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
          services: services.map((s, i) => ({
            id: -(Math.abs(id) * 100 + i),
            appointment_id: id,
            service_id: s.id,
            price: Number(s.base_price),
            quantity: 1,
            status: 'pending',
            started_at: null,
            completed_at: null,
            created_at: now,
            service: s,
          })),
          vehicle: vehicle ?? undefined,
          technician: suggestion
            ? { id: suggestion.technicianId, full_name: suggestion.technicianName, phone: null }
            : undefined,
          address: address
            ? {
                address_line: address.address_line,
                city: address.city,
                state: address.state,
                zip: address.zip,
              }
            : null,
        };

        set({ appointments: [...get().appointments, appointment], _nextId: id - 1 });
        return id;
      },

      updateAppointment: (id, patch) => {
        set({
          appointments: get().appointments.map((a) =>
            a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a,
          ),
        });
      },

      overrideAppointment: (id, patch) => {
        const prev = get().overrides[id] ?? {};
        set({
          overrides: {
            ...get().overrides,
            [id]: { ...prev, ...patch, updated_at: new Date().toISOString() },
          },
        });
      },

      removeAppointment: (id) => {
        set({ appointments: get().appointments.filter((a) => a.id !== id) });
      },

      clear: () => {
        set({ appointments: [], overrides: {}, _nextId: -1 });
      },
    }),
    {
      name: '@demo/appointments',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        appointments: state.appointments,
        overrides: state.overrides,
        _nextId: state._nextId,
      }),
    },
  ),
);
// @demo-end
