/**
 * `useCleanIntentSnoozeStore` (PR-UX-20) — explicit user snooze
 * decisions for the auto-promote conflict-free intent toast.
 *
 * Distinct from `clean-intent-promotion.ts` (which tracks INVOLUNTARY
 * dismissal-rate suppression). This store records EXPLICIT user
 * choices made via the toast's long-press snooze menu:
 *
 *   - **Snooze for this card** → 24 hour snooze keyed by intent id.
 *     ("This card" reads as "this intent's card" in the user's
 *     mental model.) Persisted across launches so dismissing one
 *     spam card today doesn't re-pester tomorrow.
 *   - **Snooze 1 hour** → +1h on the same per-intent map. Same
 *     persistence shape as the 24h variant.
 *   - **Snooze today** → end-of-local-day timestamp on the same
 *     per-intent map. (Computed at write time so DST transitions
 *     don't drift the deadline.)
 *   - **Snooze for this session** → sets `sessionSuppressed: true`
 *     and is held in NON-PERSISTENT state so the next app launch
 *     starts fresh.
 *
 * Selector contract:
 *
 *   `isIntentSnoozed(intentId)` — `true` when EITHER the per-intent
 *   timestamp is in the future OR `sessionSuppressed` is true. The
 *   detection hook (`useCleanIntentPromotion`) consults this on
 *   every promotion candidate.
 *
 * Persistence boundary (per the spec):
 *   - `snoozedIntentIds` IS persisted across launches. Per-intent
 *     decisions are long-term — the user said "not for 24 hours"
 *     and we honour that across an app kill.
 *   - `sessionSuppressed` is NOT persisted. "This session" reads
 *     as "this app session" — bouncing the app resets the choice.
 *
 * Anti-instructions:
 *   - Don't store `Date.now() + delta` for "Snooze today". Compute
 *     the actual end-of-local-day timestamp so a user who taps at
 *     11:50pm doesn't get a 24h snooze (which is what `+24h` would
 *     produce). The `endOfLocalDayMs` helper below pins this.
 *   - Don't unify with `clean-intent-promotion.ts`. They have
 *     different persistence boundaries and different write origins
 *     (involuntary vs explicit). Splitting keeps each store
 *     focused.
 *   - Don't add a "Snooze forever" option. The Dismiss-twice rule
 *     in `clean-intent-promotion.ts` is already the de-facto
 *     forever option, and an explicit "forever" choice would
 *     create an unrecoverable hole the user can't dig out of from
 *     the toast UI.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface SnoozeEntry {
  /** `Date.now()` timestamp until which this intent is snoozed. */
  until: number;
}

export interface CleanIntentSnoozeState {
  /**
   * Per-intent snooze deadlines. Persisted across launches. Keyed by
   * intent id (stringified for AsyncStorage friendliness).
   */
  snoozedIntentIds: Record<string, SnoozeEntry>;
  /**
   * "Snooze for this session" — true while the user has opted to
   * silence the toast for the rest of the app session. NOT
   * persisted; resets to `false` on app launch.
   */
  sessionSuppressed: boolean;
  /** True once the persisted slice has rehydrated from AsyncStorage. */
  _hasHydrated: boolean;

  /** Snooze the given intent for the next 24 hours. */
  snoozeIntentForCard: (intentId: number) => void;
  /** Snooze the given intent for the next 1 hour. */
  snoozeIntentOneHour: (intentId: number) => void;
  /** Snooze the given intent until the end of the local day. */
  snoozeIntentToday: (intentId: number) => void;
  /** Suppress every clean-intent toast for the rest of the app session. */
  snoozeForSession: () => void;
  /** Wipe a per-intent entry — called when an intent leaves the session. */
  clearIntent: (intentId: number) => void;

  /**
   * `true` when EITHER `sessionSuppressed` is set OR the per-intent
   * deadline is in the future. Auto-purges past entries on read so
   * a stale per-intent map doesn't grow unbounded over time.
   */
  isIntentSnoozed: (intentId: number) => boolean;

  /** Test reset — wipes both maps and the session flag. */
  reset: () => void;
}

const STORAGE_KEY = "@remi/clean-intent-snooze/v1";

const INITIAL_STATE: Omit<
  CleanIntentSnoozeState,
  | "snoozeIntentForCard"
  | "snoozeIntentOneHour"
  | "snoozeIntentToday"
  | "snoozeForSession"
  | "clearIntent"
  | "isIntentSnoozed"
  | "reset"
> = {
  snoozedIntentIds: {},
  sessionSuppressed: false,
  _hasHydrated: false,
};

/**
 * Returns the `Date.now()` value at midnight local-time at the END
 * of today. Pure — operates only on the supplied `now` parameter so
 * tests can pin DST and timezone transitions deterministically.
 *
 * "End of today" reads as "last instant before tomorrow midnight"
 * in the user's mental model — i.e. the user said "Snooze today"
 * and expects the toast to come back tomorrow morning, not at
 * 11:59:59pm tonight. We return the next-day midnight timestamp
 * so the deadline strictly excludes today.
 */
export function endOfLocalDayMs(now: number = Date.now()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime() + TWENTY_FOUR_HOURS_MS;
}

export const useCleanIntentSnoozeStore = create<CleanIntentSnoozeState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      snoozeIntentForCard: (intentId) => {
        const now = Date.now();
        const until = now + TWENTY_FOUR_HOURS_MS;
        if (__DEV__) {
          console.log(
            "[DEBUG:Store/CleanIntentSnooze] snoozeIntentForCard",
            { intentId, untilDeltaMs: until - now },
          );
        }
        set((state) => ({
          snoozedIntentIds: {
            ...state.snoozedIntentIds,
            [String(intentId)]: { until },
          },
        }));
      },

      snoozeIntentOneHour: (intentId) => {
        const now = Date.now();
        const until = now + ONE_HOUR_MS;
        if (__DEV__) {
          console.log("[DEBUG:Store/CleanIntentSnooze] snoozeIntentOneHour", {
            intentId,
            untilDeltaMs: until - now,
          });
        }
        set((state) => ({
          snoozedIntentIds: {
            ...state.snoozedIntentIds,
            [String(intentId)]: { until },
          },
        }));
      },

      snoozeIntentToday: (intentId) => {
        const now = Date.now();
        const until = endOfLocalDayMs(now);
        if (__DEV__) {
          console.log("[DEBUG:Store/CleanIntentSnooze] snoozeIntentToday", {
            intentId,
            untilDeltaMs: until - now,
          });
        }
        set((state) => ({
          snoozedIntentIds: {
            ...state.snoozedIntentIds,
            [String(intentId)]: { until },
          },
        }));
      },

      snoozeForSession: () => {
        if (__DEV__) {
          console.log("[DEBUG:Store/CleanIntentSnooze] snoozeForSession");
        }
        set({ sessionSuppressed: true });
      },

      clearIntent: (intentId) => {
        const key = String(intentId);
        const state = get();
        if (state.snoozedIntentIds[key] == null) return;
        if (__DEV__) {
          console.log(
            "[DEBUG:Store/CleanIntentSnooze] clearIntent",
            intentId,
          );
        }
        const next = { ...state.snoozedIntentIds };
        delete next[key];
        set({ snoozedIntentIds: next });
      },

      isIntentSnoozed: (intentId) => {
        const state = get();
        if (state.sessionSuppressed) return true;
        const entry = state.snoozedIntentIds[String(intentId)];
        if (entry == null) return false;
        if (entry.until <= Date.now()) {
          // Lazy purge — removes the stale entry on read so the
          // persisted map doesn't grow unbounded over weeks.
          const next = { ...state.snoozedIntentIds };
          delete next[String(intentId)];
          set({ snoozedIntentIds: next });
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
      // Persist only the per-intent map. `sessionSuppressed` is
      // intentionally session-only.
      partialize: (state) => ({
        snoozedIntentIds: state.snoozedIntentIds,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            "[clean-intent-snooze:store] failed to rehydrate from AsyncStorage",
            error,
          );
          return;
        }
        if (!state) return;
        useCleanIntentSnoozeStore.setState({ _hasHydrated: true });
      },
    },
  ),
);

/** Test-only reset helper. Mirrors the other clean-intent stores. */
export const __resetCleanIntentSnoozeStoreForTests = (): void => {
  useCleanIntentSnoozeStore.setState({
    ...INITIAL_STATE,
    snoozeIntentForCard:
      useCleanIntentSnoozeStore.getState().snoozeIntentForCard,
    snoozeIntentOneHour:
      useCleanIntentSnoozeStore.getState().snoozeIntentOneHour,
    snoozeIntentToday:
      useCleanIntentSnoozeStore.getState().snoozeIntentToday,
    snoozeForSession: useCleanIntentSnoozeStore.getState().snoozeForSession,
    clearIntent: useCleanIntentSnoozeStore.getState().clearIntent,
    isIntentSnoozed: useCleanIntentSnoozeStore.getState().isIntentSnoozed,
    reset: useCleanIntentSnoozeStore.getState().reset,
  });
};
