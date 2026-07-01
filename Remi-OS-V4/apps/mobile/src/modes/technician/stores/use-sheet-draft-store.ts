/**
 * `useSheetDraftStore` (P3-FE-6) — Zustand slice that caches in-flight
 * form-sheet contents so the user's typing survives implicit close
 * (tap-outside, swipe-down, navigation away).
 *
 * The five calendar form sheets — `AppointmentFormSheet`,
 * `PersonalEventFormSheet`, `RescheduleSheet`, `CancelSheet`,
 * `GenerateAppointmentSheet` — each lose their entire local
 * field state on dismount today. The user-facing failure is:
 *
 *   "FO types half a customer note, taps out of the sheet to
 *    check a customer's last visit, comes back, finds an empty
 *    form."
 *
 * This store records the latest values per `(cacheKey, sheetKind)`
 * pair while the sheet is mounted; the consuming sheet seeds its
 * default values from the cached entry on the next mount. Save /
 * explicit Cancel / `useCalendarStore.dismissDraft` clear the
 * relevant entries so a freshly-derived form doesn't re-restore
 * stale typing.
 *
 * **Lifecycle (intentional design):**
 *
 *   - Session-scoped only. NOT persisted via Zustand `persist`
 *     middleware. Typed text is not valuable enough to survive a
 *     full app reload (Metro refresh, OTA install, fresh launch);
 *     only navigation-within-session is in scope.
 *   - Held in the same store layer as `usePendingRealityStore` and
 *     `useCalendarStore.pendingDraft`, but DELIBERATELY a separate
 *     slice from both — see the PLAN-DEVIATION marker below for
 *     why conflating them is unsafe.
 *
 * **Cache key shape:**
 *
 *   The `cacheKey` is an opaque string derived by the screen
 *   mounting the sheet (typically `app/(tabs)/index.tsx`). The
 *   conventions used today:
 *
 *     - `draft:<draftId>`     — sheet opened on a `pendingDraft`
 *                                from tap-to-create.
 *     - `appt:<appointmentId>` — sheet opened on an existing
 *                                appointment (Reschedule, Cancel,
 *                                Appointment edit).
 *     - `pe:<eventId>`        — Personal-event edit.
 *     - `generate`            — singleton key for
 *                                `GenerateAppointmentSheet` (no
 *                                per-appointment context).
 *
 *   `clearForDraft(cacheKey)` removes ALL sheetKind buckets under a
 *   given cacheKey, so `useCalendarStore.dismissDraft` can sweep
 *   every sheet associated with the just-dismissed draft in one
 *   call (`clearForDraft(\`draft:${draftId}\`)`). The screen wires
 *   the prefix; the store is agnostic about the convention.
 */

// PLAN-DEVIATION: 2026-04-21-rotation-sideways-draft — RHF cache
// state MUST stay in this slice, separate from
// `useCalendarStore.pendingDraft` and `usePendingRealityStore`.
// Re-merging them would split draft state across two stores again,
// revive the timer race conditions the persistent-state model
// already fixed, and create the two-sources-of-truth pattern that
// rotation deviation retired. See
// docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft and
// docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6 for the full
// rationale.

import { create } from "zustand";

/**
 * Cache-key constructors. Centralized here so the consuming
 * screen, the form sheet, and `useCalendarStore.dismissDraft` all
 * agree on the exact string that identifies a given form
 * instance. Mismatched keys silently turn the cache into a
 * write-only sink (writes go to one bucket, reads from another),
 * which is the worst possible failure mode for this feature.
 *
 * The shape is `<scope>:<id>` for entity-bound forms and bare
 * scope strings for singletons. Scopes:
 *
 * - `draft:<draftId>` — sheet opened for an in-progress
 *   `useCalendarStore.pendingDraft`. Cleared on `dismissDraft`.
 * - `appt:<appointmentId>` — sheet opened to edit an existing
 *   appointment.
 * - `pe:<personalEventId>` — sheet opened to edit an existing
 *   personal event.
 * - `reschedule:<appointmentId>` — reschedule sheet for a
 *   specific appointment.
 * - `cancel:<appointmentId>` — cancel sheet for a specific
 *   appointment.
 * - `generate` — singleton AI scheduling sheet (no per-entity
 *   id).
 */
export const sheetDraftCacheKey = {
  draft: (draftId: string) => `draft:${draftId}`,
  appointment: (appointmentId: number | string) => `appt:${appointmentId}`,
  personalEvent: (eventId: string) => `pe:${eventId}`,
  reschedule: (appointmentId: number | string) => `reschedule:${appointmentId}`,
  cancel: (appointmentId: number | string) => `cancel:${appointmentId}`,
  generate: (): "generate" => "generate",
} as const;

export type SheetKind =
  | "appointment"
  | "personal-event"
  | "reschedule"
  | "cancel"
  | "generate";

export interface SheetDraftStoreState {
  /**
   * Two-level map keyed by (cacheKey, sheetKind). Values are the
   * latest snapshot of the sheet's form values, written debounced
   * (~300ms) by `useSheetDraftCache`. Typed `unknown` because each
   * sheet's value shape is its own concern; the consumer casts on
   * read via `getDraft<T>(...)`.
   */
  drafts: Record<string, Partial<Record<SheetKind, unknown>>>;

  /**
   * Read the last cached values for `(cacheKey, sheetKind)`. Returns
   * `undefined` when no entry exists.
   */
  getDraft: <T = unknown>(cacheKey: string, sheetKind: SheetKind) => T | undefined;

  /**
   * Write the latest values into the cache. Replaces any existing
   * entry for the same `(cacheKey, sheetKind)`.
   */
  setDraft: (cacheKey: string, sheetKind: SheetKind, values: unknown) => void;

  /**
   * Clear a single `(cacheKey, sheetKind)` entry. Called from a
   * sheet's Save success / explicit Cancel / Discard handler. If the
   * containing bucket becomes empty, the bucket is removed too so
   * `drafts` doesn't leak empty objects.
   */
  clearDraft: (cacheKey: string, sheetKind: SheetKind) => void;

  /**
   * Clear every sheetKind entry under a given `cacheKey`. Called
   * from `useCalendarStore.dismissDraft` so that when the
   * underlying `pendingDraft` is dismissed, the cache for every
   * sheet that may have been opened against it (appointment form,
   * personal-event form, etc.) is wiped in one call.
   */
  clearForDraft: (cacheKey: string) => void;

  /**
   * Wipe the entire cache. Intended for tests and for any future
   * "logout / app reset" code path.
   */
  reset: () => void;
}

const INITIAL_STATE: Pick<SheetDraftStoreState, "drafts"> = {
  drafts: {},
};

export const useSheetDraftStore = create<SheetDraftStoreState>((set, get) => ({
  ...INITIAL_STATE,

  getDraft: <T = unknown,>(cacheKey: string, sheetKind: SheetKind) => {
    const value = get().drafts[cacheKey]?.[sheetKind] as T | undefined;
    if (__DEV__) {
      console.log("[DEBUG:Store/SheetDraft] getDraft", {
        cacheKey,
        sheetKind,
        hit: value !== undefined,
      });
    }
    return value;
  },

  setDraft: (cacheKey, sheetKind, values) => {
    if (__DEV__) {
      const fieldCount =
        values && typeof values === "object" && !Array.isArray(values)
          ? Object.keys(values as Record<string, unknown>).length
          : null;
      console.log("[DEBUG:Store/SheetDraft] setDraft", {
        cacheKey,
        sheetKind,
        fieldCount,
      });
    }
    set((state) => ({
      drafts: {
        ...state.drafts,
        [cacheKey]: { ...(state.drafts[cacheKey] ?? {}), [sheetKind]: values },
      },
    }));
  },

  clearDraft: (cacheKey, sheetKind) =>
    set((state) => {
      const bucket = state.drafts[cacheKey];
      if (!bucket || !(sheetKind in bucket)) {
        if (__DEV__) {
          console.log("[DEBUG:Store/SheetDraft] clearDraft (no-op)", {
            cacheKey,
            sheetKind,
          });
        }
        return state;
      }
      if (__DEV__) {
        console.log("[DEBUG:Store/SheetDraft] clearDraft", {
          cacheKey,
          sheetKind,
        });
      }
      const { [sheetKind]: _removed, ...rest } = bucket;
      const next = { ...state.drafts };
      if (Object.keys(rest).length === 0) {
        delete next[cacheKey];
      } else {
        next[cacheKey] = rest;
      }
      return { drafts: next };
    }),

  clearForDraft: (cacheKey) =>
    set((state) => {
      if (!(cacheKey in state.drafts)) {
        if (__DEV__) {
          console.log("[DEBUG:Store/SheetDraft] clearForDraft (no-op)", {
            cacheKey,
          });
        }
        return state;
      }
      if (__DEV__) {
        const sheetKinds = Object.keys(state.drafts[cacheKey] ?? {});
        console.log("[DEBUG:Store/SheetDraft] clearForDraft", {
          cacheKey,
          clearedSheetKinds: sheetKinds,
        });
      }
      const next = { ...state.drafts };
      delete next[cacheKey];
      return { drafts: next };
    }),

  reset: () => {
    if (__DEV__) {
      console.log("[DEBUG:Store/SheetDraft] reset");
    }
    set({ ...INITIAL_STATE });
  },
}));

/**
 * Test helper — restores the store to its initial state. Lives in
 * the same module (rather than a separate test-utils file) so test
 * files can import it without pulling in Jest setup that production
 * code shouldn't see.
 *
 * NOT exported from any package barrel — the only legitimate caller
 * is a `beforeEach` in `__tests__/`. Mirrors the pattern used by
 * `__resetPendingRealityStoreForTests` in `pending-reality.ts`.
 */
export function __resetSheetDraftStoreForTests(): void {
  // Merge-set (no `true` flag) so the action methods on the store
  // survive — only the data slice is reset.
  useSheetDraftStore.setState({ ...INITIAL_STATE });
}
