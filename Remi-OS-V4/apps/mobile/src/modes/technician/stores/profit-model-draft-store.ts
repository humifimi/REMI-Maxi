// PM-6 — Tiny Zustand store that lets the share/[token] route hand a fetched
// session off to the calculator screen without serialising the entire input
// blob through Expo Router params (which would either truncate or corrupt
// large payloads). The share-loader sets the pending session, navigates to
// `/(public)/profit-calculator`, and the calculator's mount effect reads +
// clears it so a manual refresh of the calculator after load doesn't keep
// re-applying the same scenario.
//
// Renamed from `useProfitModelPending` (P0-FE-4, calendar-reorganization
// master plan §1.5/A7) to avoid cognitive collision with the new
// `usePendingRealityStore` introduced by P3-FE-1, which holds in-flight
// scheduling intents — an entirely separate domain. "Draft" here is a
// profit-calculator scenario waiting to be consumed by the calculator
// screen; nothing to do with scheduling.

import { create } from "zustand";
import type { ProfitModelSession } from "@technician/types/profit-model";

interface DraftScenarioState {
  pending: ProfitModelSession | null;
  setPending: (session: ProfitModelSession) => void;
  consume: () => ProfitModelSession | null;
  clear: () => void;
}

export const useProfitModelDraftStore = create<DraftScenarioState>((set, get) => ({
  pending: null,
  setPending: (session) => set({ pending: session }),
  consume: () => {
    const current = get().pending;
    if (current) set({ pending: null });
    return current;
  },
  clear: () => set({ pending: null }),
}));

/**
 * @deprecated Renamed to `useProfitModelDraftStore` in P0-FE-4 to avoid
 * cognitive collision with `usePendingRealityStore` (scheduling intents).
 * This re-export exists for one release window so any in-flight branches
 * keep compiling. Remove once all consumers have been migrated — no
 * remaining call sites in this repo as of the rename, so this can be
 * deleted in the next cleanup pass.
 */
export const useProfitModelPending = useProfitModelDraftStore;
