import { create } from 'zustand';
import type { Service, Vehicle, Address, ScoredSuggestion, DeferredWorkItem, CreateBookingResponse } from '@customer/types/api';

// ---------------------------------------------------------------------------
// Observation-type → component hint (shared by all entry points)
// ---------------------------------------------------------------------------
export function hintFromObservation(obs: string | undefined): string {
  const lower = (obs ?? '').toLowerCase();
  if (lower.includes('brake') || lower.includes('pad')) return 'brakes';
  if (lower.includes('filter')) return 'filter';
  if (lower.includes('tire') || lower.includes('tread') || lower.includes('pressure')) return 'tires';
  if (lower.includes('wiper')) return 'wipers';
  if (lower.includes('fluid') || lower.includes('coolant') || lower.includes('transmission')) return 'fluids';
  if (lower.includes('oil')) return 'oil';
  return 'oil';
}

// ---------------------------------------------------------------------------
// Booking flow routes
// ---------------------------------------------------------------------------
const ROUTE_SELECT_SERVICE = '/customer/booking/select-service' as const;
const ROUTE_SELECT_ADDRESS = '/customer/booking/select-address' as const;

export type BookingRoute = typeof ROUTE_SELECT_SERVICE | typeof ROUTE_SELECT_ADDRESS;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
const INITIAL_STATE = {
  selectedServices: [] as Service[],
  selectedVehicle: null as Vehicle | null,
  selectedDate: null as string | null,
  selectedTime: null as string | null,
  selectedAddress: null as Address | null,
  selectedSuggestion: null as ScoredSuggestion | null,
  deferredItemId: null as number | null,
  prefilled: false,
  suggestedComponent: null as string | null,
  suggestedComponents: [] as string[],
  selectedPaymentMethodId: null as string | null,
};

interface BookingState {
  selectedServices: Service[];
  selectedVehicle: Vehicle | null;
  selectedDate: string | null;
  selectedTime: string | null;
  selectedAddress: Address | null;
  selectedSuggestion: ScoredSuggestion | null;
  deferredItemId: number | null;
  prefilled: boolean;
  suggestedComponent: string | null;
  suggestedComponents: string[];
  selectedPaymentMethodId: string | null;

  // --- Step-level actions (used by individual booking screens) ---
  toggleService: (service: Service) => void;
  setVehicle: (vehicle: Vehicle) => void;
  setDateTime: (date: string, time: string) => void;
  setAddress: (address: Address) => void;
  setSelectedSuggestion: (suggestion: ScoredSuggestion) => void;
  setSuggestedComponent: (component: string | null) => void;
  setPaymentMethodId: (id: string | null) => void;
  prefillFromDeferred: (item: DeferredWorkItem, vehicle: Vehicle, service: Service) => void;
  reset: () => void;

  // --- Centralized entry-point actions (always reset first) ---
  startFreshBooking: () => BookingRoute;
  startWithComponent: (component: string, vehicle?: Vehicle | null) => BookingRoute;
  startWithComponents: (components: string[], vehicle: Vehicle) => BookingRoute;
  startFromDeferred: (item: DeferredWorkItem, vehicle: Vehicle, service: Service) => BookingRoute;
  startFromDeferredFallback: (observationType: string, vehicle?: Vehicle | null) => BookingRoute;
  startWithPreselectedServices: (services: Service[], vehicle?: Vehicle | null) => BookingRoute;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  ...INITIAL_STATE,

  toggleService: (service) => {
    const current = get().selectedServices;
    const exists = current.find((s) => s.id === service.id);
    if (exists) {
      set({ selectedServices: current.filter((s) => s.id !== service.id) });
    } else {
      set({ selectedServices: [...current, service] });
    }
  },

  setVehicle: (vehicle) => set({ selectedVehicle: vehicle }),
  setDateTime: (date, time) => set({ selectedDate: date, selectedTime: time }),
  setAddress: (address) => set({ selectedAddress: address }),
  setSuggestedComponent: (component) => set({ suggestedComponent: component }),
  setPaymentMethodId: (id) => set({ selectedPaymentMethodId: id }),
  setSelectedSuggestion: (suggestion) =>
    set({
      selectedSuggestion: suggestion,
      selectedDate: suggestion.date,
      selectedTime: suggestion.timeSlot,
    }),

  prefillFromDeferred: (item, vehicle, service) =>
    set({
      ...INITIAL_STATE,
      selectedServices: [service],
      selectedVehicle: vehicle,
      deferredItemId: item.id,
      prefilled: true,
    }),

  reset: () => set({ ...INITIAL_STATE }),

  // --- Centralized entry points ---

  startFreshBooking: () => {
    set({ ...INITIAL_STATE });
    return ROUTE_SELECT_SERVICE;
  },

  startWithComponent: (component, vehicle) => {
    set({
      ...INITIAL_STATE,
      suggestedComponent: component,
      suggestedComponents: [component],
      selectedVehicle: vehicle ?? null,
    });
    return ROUTE_SELECT_SERVICE;
  },

  startWithComponents: (components, vehicle) => {
    set({
      ...INITIAL_STATE,
      suggestedComponent: components[0] ?? null,
      suggestedComponents: components,
      selectedVehicle: vehicle,
    });
    return ROUTE_SELECT_SERVICE;
  },

  startFromDeferred: (item, vehicle, service) => {
    set({
      ...INITIAL_STATE,
      selectedServices: [service],
      selectedVehicle: vehicle,
      deferredItemId: item.id,
      prefilled: true,
    });
    return ROUTE_SELECT_ADDRESS;
  },

  startFromDeferredFallback: (observationType, vehicle) => {
    set({
      ...INITIAL_STATE,
      suggestedComponent: hintFromObservation(observationType),
      selectedVehicle: vehicle ?? null,
    });
    return ROUTE_SELECT_SERVICE;
  },

  startWithPreselectedServices: (services, vehicle) => {
    set({
      ...INITIAL_STATE,
      selectedServices: [...services],
      selectedVehicle: vehicle ?? null,
      prefilled: true,
    });
    return ROUTE_SELECT_ADDRESS;
  },
}));

export interface BookingConfirmationSnapshot {
  selectedServices: Service[];
  selectedVehicle: Vehicle | null;
  selectedDate: string | null;
  selectedTime: string | null;
  selectedAddress: Address | null;
  selectedSuggestion: ScoredSuggestion | null;
  deferredItemId: number | null;
  suggestedComponent: string | null;
  suggestedComponents: string[];
  serverResponse: CreateBookingResponse | null;
}

let lastBookingConfirmation: BookingConfirmationSnapshot | null = null;

/** Call before reset + navigation to `/customer/booking/confirmed` so the success screen can show a stable summary. */
export function captureBookingForConfirmation(serverResponse?: CreateBookingResponse): void {
  const s = useBookingStore.getState();
  lastBookingConfirmation = {
    selectedServices: [...s.selectedServices],
    selectedVehicle: s.selectedVehicle,
    selectedDate: s.selectedDate,
    selectedTime: s.selectedTime,
    selectedAddress: s.selectedAddress,
    selectedSuggestion: s.selectedSuggestion,
    deferredItemId: s.deferredItemId,
    suggestedComponent: s.suggestedComponent,
    suggestedComponents: [...s.suggestedComponents],
    serverResponse: serverResponse ?? null,
  };
}

export function consumeBookingConfirmation(): BookingConfirmationSnapshot | null {
  const out = lastBookingConfirmation;
  lastBookingConfirmation = null;
  return out;
}
