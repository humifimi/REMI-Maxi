/**
 * `useCleanIntentSettingsStore` (PR-UX-20) — user preferences for the
 * auto-promote conflict-free intent flow.
 *
 * Two toggles, both persisted via the existing Zustand `persist` +
 * AsyncStorage pattern (mirrors `src/stores/accessibility.ts` and
 * `src/stores/demo-settings.ts`):
 *
 *   - `confirmBeforeApplyingCleanMoves` (default OFF) — when ON, the
 *     `CleanIntentPromotionToast`'s "Apply now" button shows a
 *     confirmation alert before dispatching the finalize/authorize
 *     sequence. The Sweep button on the review screen also defers to
 *     this preference (see `app/pending-reality/review.tsx`).
 *   - `showCleanMoveSuggestions` (default ON) — when OFF, the
 *     `useCleanIntentPromotion` detection hook returns
 *     `currentlyPromotingIntent: null`, so the calendar-tab toast
 *     never surfaces. The review screen's Sweep button is opt-in
 *     (the user already navigated to the review surface) and
 *     remains visible regardless of this toggle.
 *
 * Why a dedicated store instead of folding into `accessibility.ts`:
 * the accessibility store is shared across landscape calendar, the
 * bug-reporter bubble, and any future a11y feature; mixing in
 * "clean-intent suggestion" prefs would couple the two domains. The
 * pattern (a per-feature `*-settings.ts` store) follows
 * `demo-settings.ts` precedent.
 *
 * Anti-instructions:
 *   - Don't fold the snooze rules in here. Snooze lives in
 *     `src/stores/clean-intent-snooze.ts` because it's per-intent
 *     state with a session boundary, not a global preference.
 *   - Don't fold the suppression rate-limit state in here. That
 *     lives in `src/stores/clean-intent-promotion.ts` because it's
 *     ephemeral counter state, not a persisted preference.
 *   - When you add a new toggle, list it in `partialize` so it
 *     persists across launches.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CleanIntentSettingsState {
  /**
   * When true, the toast's "Apply now" button shows a confirmation
   * alert before dispatching. Default OFF — the toast is already
   * gated on "no conflicts" and the user has explicit Remove /
   * Dismiss actions; an extra confirmation step would defeat the
   * "auto-promote" vibe of the feature.
   */
  confirmBeforeApplyingCleanMoves: boolean;
  /**
   * When false, the calendar-tab toast never surfaces because
   * `useCleanIntentPromotion` returns `currentlyPromotingIntent:
   * null`. The Sweep button on the review screen is unaffected
   * (the user opted in by navigating to the review surface).
   */
  showCleanMoveSuggestions: boolean;
  /** True once the persisted slice has rehydrated from AsyncStorage. */
  _hasHydrated: boolean;

  setConfirmBeforeApplyingCleanMoves: (next: boolean) => void;
  setShowCleanMoveSuggestions: (next: boolean) => void;
}

const STORAGE_KEY = "@remi/clean-intent-settings/v1";

const initialState: Omit<
  CleanIntentSettingsState,
  "setConfirmBeforeApplyingCleanMoves" | "setShowCleanMoveSuggestions"
> = {
  confirmBeforeApplyingCleanMoves: false,
  showCleanMoveSuggestions: true,
  _hasHydrated: false,
};

export const useCleanIntentSettingsStore = create<CleanIntentSettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setConfirmBeforeApplyingCleanMoves: (next) =>
        set({ confirmBeforeApplyingCleanMoves: next }),
      setShowCleanMoveSuggestions: (next) =>
        set({ showCleanMoveSuggestions: next }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        confirmBeforeApplyingCleanMoves: state.confirmBeforeApplyingCleanMoves,
        showCleanMoveSuggestions: state.showCleanMoveSuggestions,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            "[clean-intent-settings:store] failed to rehydrate from AsyncStorage",
            error,
          );
          return;
        }
        if (!state) return;
        useCleanIntentSettingsStore.setState({ _hasHydrated: true });
      },
    },
  ),
);

/**
 * Test-only helper. Resets the in-memory store back to defaults so
 * each test starts from a known state. Not exported through any
 * package barrel — tests import directly from this module.
 */
export const __resetCleanIntentSettingsStoreForTests = (): void => {
  useCleanIntentSettingsStore.setState({
    ...initialState,
    setConfirmBeforeApplyingCleanMoves:
      useCleanIntentSettingsStore.getState().setConfirmBeforeApplyingCleanMoves,
    setShowCleanMoveSuggestions:
      useCleanIntentSettingsStore.getState().setShowCleanMoveSuggestions,
  });
};
