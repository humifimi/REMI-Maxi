/**
 * `useCleanIntentPromotionStore` (PR-UX-20) — dismissal counters and
 * rate-limit state for the auto-promote conflict-free intent toast.
 *
 * Two mutually-supporting suppression rules:
 *
 *   1. **Per-intent.** After the user dismisses the toast for the
 *      same `intentId` `PER_INTENT_DISMISSAL_THRESHOLD` (= 2) times,
 *      `isIntentSuppressed(intentId)` returns `true` and the
 *      detection hook (`useCleanIntentPromotion`) skips that intent
 *      until the BE drops it (apply / remove / supersede), at which
 *      point the consumer calls `clearIntent(intentId)` to wipe the
 *      counter.
 *
 *   2. **System-wide rate limit.** If `recentDismissals` accumulates
 *      `SYSTEM_WIDE_DISMISSAL_THRESHOLD` (= 5) entries inside a
 *      `SYSTEM_WIDE_WINDOW_MS` (= 60s) sliding window, set
 *      `systemWideSuppressedUntil = now + SYSTEM_WIDE_COOLDOWN_MS`
 *      (= 5 minutes). While that timestamp is in the future,
 *      `isSystemWideSuppressed()` returns `true` and the toast does
 *      not surface for ANY intent. Auto-clears on the next
 *      detection-hook tick after the cooldown lapses.
 *
 * Persistence boundary (per the spec):
 *   - `dismissalsByIntentId` IS persisted across launches (the user's
 *     long-term "I don't want to see this again" signal survives the
 *     app being killed).
 *   - `recentDismissals` is NOT persisted — the rate limit is a
 *     short-term "user is mashing dismiss" detector, and it's safer
 *     to reset on launch than to surprise a returning user with a
 *     pre-existing 5-minute cooldown.
 *   - `systemWideSuppressedUntil` is NOT persisted for the same
 *     reason: a stale cooldown timestamp from yesterday's session
 *     would silently swallow today's first toast.
 *
 * Why a separate file from `clean-intent-snooze.ts`:
 *   - Suppression is INVOLUNTARY (the system decides "you keep
 *     dismissing, we'll back off") and survives launches.
 *   - Snooze is EXPLICIT (the user chose a duration from the
 *     long-press menu) and has its own session-boundary semantics.
 *   The two fields coexist on the detection hook's "should we show
 *   this intent?" query but the rules and lifetimes differ enough
 *   that splitting the stores keeps each one focused.
 *
 * Anti-instructions:
 *   - Don't increment `dismissalsByIntentId` from anywhere except the
 *     toast's Dismiss button. Apply / Remove / auto-dismiss after 8s
 *     are NOT user-driven dismissals; counting them would suppress
 *     the next clean intent the user genuinely wanted to see.
 *   - Don't auto-clear per-intent counters with a TTL. The per-intent
 *     rule is "you've told me twice, I'll stop asking" — a TTL would
 *     re-pester the user. The counter clears only when the intent
 *     itself goes away (via `clearIntent(intentId)` from the
 *     consumer's effect on intent-set change).
 *   - Don't persist `recentDismissals`. See the persistence note
 *     above.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const PER_INTENT_DISMISSAL_THRESHOLD = 2;
export const SYSTEM_WIDE_DISMISSAL_THRESHOLD = 5;
export const SYSTEM_WIDE_WINDOW_MS = 60_000;
export const SYSTEM_WIDE_COOLDOWN_MS = 5 * 60 * 1000;

export interface DismissalEntry {
  count: number;
  lastAt: number;
}

export interface CleanIntentPromotionState {
  /**
   * Long-term per-intent dismissal counters. Persisted across launches.
   * Keyed by intent id (stringified for AsyncStorage friendliness).
   */
  dismissalsByIntentId: Record<string, DismissalEntry>;
  /**
   * Sliding window of recent dismissal timestamps used by the
   * system-wide rate-limit rule. NOT persisted (see file-level note).
   */
  recentDismissals: number[];
  /**
   * `Date.now()` timestamp until which the system-wide suppression
   * is active. NOT persisted (see file-level note). Auto-cleared by
   * `isSystemWideSuppressed()` once the deadline passes.
   */
  systemWideSuppressedUntil: number | null;
  /** True once the persisted slice has rehydrated from AsyncStorage. */
  _hasHydrated: boolean;

  /**
   * Increment the per-intent count for `intentId` AND push `now()`
   * into the sliding window. If the window threshold is exceeded,
   * sets `systemWideSuppressedUntil` to `now + SYSTEM_WIDE_COOLDOWN_MS`.
   *
   * Single entry point — DON'T call from auto-dismiss / apply / remove.
   * Only the Dismiss button on the toast counts as a "user dismissal."
   */
  recordDismissal: (intentId: number) => void;

  /**
   * Wipe the per-intent counter for `intentId`. Called when the
   * intent leaves the active session (applied, removed, or
   * superseded by an updated session row). The detection hook's
   * cleanup effect is the legitimate caller.
   */
  clearIntent: (intentId: number) => void;

  /**
   * `true` when the per-intent count for `intentId` has reached
   * `PER_INTENT_DISMISSAL_THRESHOLD`.
   */
  isIntentSuppressed: (intentId: number) => boolean;

  /**
   * `true` when the system-wide cooldown is currently active (i.e.
   * `systemWideSuppressedUntil > now`). Auto-clears the timestamp
   * if it's in the past so the next call returns the truth without
   * a stale read.
   */
  isSystemWideSuppressed: () => boolean;

  /** Test reset — clears every counter, the window, and the cooldown. */
  reset: () => void;
}

const STORAGE_KEY = "@remi/clean-intent-promotion/v1";

const INITIAL_STATE: Omit<
  CleanIntentPromotionState,
  | "recordDismissal"
  | "clearIntent"
  | "isIntentSuppressed"
  | "isSystemWideSuppressed"
  | "reset"
> = {
  dismissalsByIntentId: {},
  recentDismissals: [],
  systemWideSuppressedUntil: null,
  _hasHydrated: false,
};

export const useCleanIntentPromotionStore = create<CleanIntentPromotionState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      recordDismissal: (intentId) => {
        const now = Date.now();
        const key = String(intentId);
        const state = get();
        const previous = state.dismissalsByIntentId[key];
        const nextCount = (previous?.count ?? 0) + 1;
        // Trim the sliding window to entries inside the most-recent
        // SYSTEM_WIDE_WINDOW_MS before deciding whether the rate
        // limit tripped on THIS dismissal.
        const cutoff = now - SYSTEM_WIDE_WINDOW_MS;
        const recent = [
          ...state.recentDismissals.filter((t) => t > cutoff),
          now,
        ];
        const tripped = recent.length >= SYSTEM_WIDE_DISMISSAL_THRESHOLD;
        if (__DEV__) {
          console.log("[DEBUG:Store/CleanIntentPromotion] recordDismissal", {
            intentId,
            nextCount,
            recentLen: recent.length,
            tripped,
          });
        }
        set({
          dismissalsByIntentId: {
            ...state.dismissalsByIntentId,
            [key]: { count: nextCount, lastAt: now },
          },
          recentDismissals: recent,
          systemWideSuppressedUntil: tripped
            ? now + SYSTEM_WIDE_COOLDOWN_MS
            : state.systemWideSuppressedUntil,
        });
      },

      clearIntent: (intentId) => {
        const key = String(intentId);
        const state = get();
        if (state.dismissalsByIntentId[key] == null) return;
        if (__DEV__) {
          console.log(
            "[DEBUG:Store/CleanIntentPromotion] clearIntent",
            intentId,
          );
        }
        const next = { ...state.dismissalsByIntentId };
        delete next[key];
        set({ dismissalsByIntentId: next });
      },

      isIntentSuppressed: (intentId) => {
        const entry = get().dismissalsByIntentId[String(intentId)];
        return (entry?.count ?? 0) >= PER_INTENT_DISMISSAL_THRESHOLD;
      },

      isSystemWideSuppressed: () => {
        const until = get().systemWideSuppressedUntil;
        if (until == null) return false;
        if (until <= Date.now()) {
          // Auto-clear so subsequent reads are cheap and consistent.
          set({ systemWideSuppressedUntil: null });
          return false;
        }
        return true;
      },

      reset: () => {
        set({ ...INITIAL_STATE, _hasHydrated: get()._hasHydrated });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the long-term per-intent counters. The sliding
      // window + cooldown are intentionally session-only — see the
      // file-level note for the rationale.
      partialize: (state) => ({
        dismissalsByIntentId: state.dismissalsByIntentId,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            "[clean-intent-promotion:store] failed to rehydrate from AsyncStorage",
            error,
          );
          return;
        }
        if (!state) return;
        useCleanIntentPromotionStore.setState({ _hasHydrated: true });
      },
    },
  ),
);

/**
 * Test-only helper. Wipes every counter, the rate-limit window, and
 * the cooldown. Mirrors `__resetAccessibilityStoreForTests`.
 */
export const __resetCleanIntentPromotionStoreForTests = (): void => {
  useCleanIntentPromotionStore.setState({
    ...INITIAL_STATE,
    recordDismissal: useCleanIntentPromotionStore.getState().recordDismissal,
    clearIntent: useCleanIntentPromotionStore.getState().clearIntent,
    isIntentSuppressed:
      useCleanIntentPromotionStore.getState().isIntentSuppressed,
    isSystemWideSuppressed:
      useCleanIntentPromotionStore.getState().isSystemWideSuppressed,
    reset: useCleanIntentPromotionStore.getState().reset,
  });
};
