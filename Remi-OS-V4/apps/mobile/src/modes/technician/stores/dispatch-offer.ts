import { create } from "zustand";
import type { IncomingDispatch } from "@technician/types/api";

interface DispatchOfferState {
  currentOffer: IncomingDispatch | null;
  isVisible: boolean;

  showOffer: (offer: IncomingDispatch) => void;
  dismiss: () => void;
}

export const useDispatchOfferStore = create<DispatchOfferState>((set) => ({
  currentOffer: null,
  isVisible: false,

  showOffer: (offer) => set({ currentOffer: offer, isVisible: true }),
  dismiss: () => set({ isVisible: false, currentOffer: null }),
}));
