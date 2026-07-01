import { create } from "zustand";
import type {
  Vehicle,
  User,
  AppointmentService,
  DecodedVehicle,
  DeferredWorkItemCreatePayload,
  CustomerVehicleOption,
} from "@technician/types/api";

interface JobFlowState {
  appointmentId: number | null;
  decodedVehicle: DecodedVehicle | null;
  vehicle: Vehicle | null;
  customer: User | null;
  services: AppointmentService[];
  deferredItems: DeferredWorkItemCreatePayload[];
  availableVehicles: CustomerVehicleOption[];
  scheduledServiceNames: string | null;
  // Captured at the end of a successful Stripe PaymentSheet flow in
  // `app/job/[id]/payment.tsx`. Phase 4's debrief/receipt screens read this
  // back to render the charge ID without re-fetching from the backend.
  // Reset by `reset()` at the start of every new job flow.
  lastPaymentIntentId: string | null;

  setAppointmentId: (id: number) => void;
  setDecodedVehicle: (decoded: DecodedVehicle) => void;
  setVehicle: (vehicle: Vehicle) => void;
  setCustomer: (customer: User) => void;
  setServices: (services: AppointmentService[]) => void;
  addDeferredItem: (item: DeferredWorkItemCreatePayload) => void;
  removeDeferredItem: (observationType: string) => void;
  clearDeferredItems: () => void;
  setAvailableVehicles: (vehicles: CustomerVehicleOption[]) => void;
  setScheduledServiceNames: (names: string | null) => void;
  setLastPaymentIntentId: (id: string | null) => void;
  reset: () => void;
}

const initialState = {
  appointmentId: null,
  decodedVehicle: null,
  vehicle: null,
  customer: null,
  services: [],
  deferredItems: [] as DeferredWorkItemCreatePayload[],
  availableVehicles: [] as CustomerVehicleOption[],
  scheduledServiceNames: null as string | null,
  lastPaymentIntentId: null as string | null,
};

export const useJobFlowStore = create<JobFlowState>((set) => ({
  ...initialState,

  setAppointmentId: (id) => set({ appointmentId: id }),
  setDecodedVehicle: (decoded) => set({ decodedVehicle: decoded }),
  setVehicle: (vehicle) => set({ vehicle }),
  setCustomer: (customer) => set({ customer }),
  setServices: (services) => set({ services }),
  addDeferredItem: (item) =>
    set((state) => ({
      deferredItems: [
        ...state.deferredItems.filter(
          (d) => d.observation_type !== item.observation_type
        ),
        item,
      ],
    })),
  removeDeferredItem: (observationType) =>
    set((state) => ({
      deferredItems: state.deferredItems.filter(
        (d) => d.observation_type !== observationType
      ),
    })),
  clearDeferredItems: () => set({ deferredItems: [] }),
  setAvailableVehicles: (vehicles) => set({ availableVehicles: vehicles }),
  setScheduledServiceNames: (names) => set({ scheduledServiceNames: names }),
  setLastPaymentIntentId: (id) => set({ lastPaymentIntentId: id }),
  reset: () => set(initialState),
}));
