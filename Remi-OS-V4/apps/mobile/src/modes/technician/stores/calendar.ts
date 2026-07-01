import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import { CALENDAR_CONFIG, DENSITY_CYCLE, type CalendarDensity } from "@technician/constants/calendar";
import {
  sheetDraftCacheKey,
  useSheetDraftStore,
} from "@technician/stores/use-sheet-draft-store";
// 2026-05-10 follow-up #2: imported for the enhanced `setFutureMode` /
// `toggleFutureMode` log lines so a future regression of the "toggle
// disappeared" bug is loud at the source. Stays a value import (not
// `import type`) because we read `getState()` at call time. No
// circular dep — `pending-reality` does NOT import this file.
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { traceCalendar } from "@technician/utils/sentry-diagnostics";

/**
 * Default visible day range. 5:00 AM – 6:00 PM, matching the original
 * hardcoded constants the calendar wrappers used before this setting existed.
 */
export const DEFAULT_DISPLAY_START_MINUTES = 300; // 05:00
export const DEFAULT_DISPLAY_END_MINUTES = 1080; // 18:00

/** Minimum visible window (1 hour). */
export const MIN_DISPLAY_RANGE_MINUTES = 60;

/**
 * Default for the "expand the visible range to cover out-of-range
 * events" behavior. ON preserves the original Phase 9.3 UX where the
 * calendar would never clip an event. Users can opt out via Settings
 * / Quick Settings to enforce strict bounds.
 */
export const DEFAULT_DISPLAY_AUTO_EXPAND = true;

/**
 * Landscape multi-tech rendering treatment (Ship 3 evaluation, P2-FE-4
 * follow-up). When the landscape WorkweekView has 2+ techs selected,
 * the vendored `react-native-resource-calendar` paints multiple techs'
 * events inside each shared day-column. This setting picks which of
 * the two candidate visual treatments the user is looking at right
 * now. Toggled at runtime via the bottom-corner `EdgeTab` on the
 * landscape canvas. Persisted so the choice survives relaunches.
 *
 * - `"stacked"`: every tech's events render full-width inside the
 *   day-column, layered via z-order. Color from `colorForTech` keeps
 *   per-tech identification.
 * - `"mini-columns"`: day-column is sliced into N equal sub-columns,
 *   one per selected tech.
 *
 * History: Ship 2 also shipped a `"stacked-bands"` treatment (each
 * tech got a full-width, full-day-height band stacked vertically); it
 * was cut in Ship 3 after the user evaluated all three on real data.
 * If a previously-persisted state still carries `"stacked-bands"`,
 * the rehydration migration below falls back to the default.
 *
 * See `docs/implementation-plans/landscape-overlay-rendering.md` for
 * the full UX rationale and `vendor/react-native-resource-calendar/
 * dist/index.d.ts` for the library-side contract.
 */
// PLAN-DEVIATION: 2026-04-20-cut-stacked-bands — Ship 2 plan promised
// THREE treatments (stacked / mini-columns / stacked-bands); Ship 3
// cut bands. Don't restore "stacked-bands" as a literal anywhere — the
// hydration migration below treats it as invalid. Full context:
// docs/PLAN-DEVIATIONS.md#2026-04-20-cut-stacked-bands
export type LandscapeMultiTechMode = "stacked" | "mini-columns";
export const LANDSCAPE_MULTI_TECH_MODES: LandscapeMultiTechMode[] = [
  "stacked",
  "mini-columns",
];
export const DEFAULT_LANDSCAPE_MULTI_TECH_MODE: LandscapeMultiTechMode = "stacked";

const isLandscapeMultiTechMode = (value: unknown): value is LandscapeMultiTechMode =>
  typeof value === "string" &&
  (LANDSCAPE_MULTI_TECH_MODES as string[]).includes(value);

/**
 * In-progress draft appointment created by a tap on an empty calendar
 * cell. Owned by `useCalendarStore`, NOT by the vendored library's
 * `useSetDraggedEventDraft` (which is for the library's own drag
 * gesture). Lives in store state — survives orientation changes and
 * the `CalendarBindingProvider` remount that comes with them — and is
 * rendered onto the canvas by `FloatingDraftCard` as a synthetic event
 * injected into the calendar's `events` array.
 *
 * One draft at a time per device. Tap on a new cell while a draft
 * exists dismisses the current draft first (handled in the consumer,
 * not in the action — `createDraft` always replaces).
 *
 * Lifecycle:
 * - `createDraft({ date, startMinutes, technicianId? })` — set on tap.
 *   Default duration is `DEFAULT_DRAFT_DURATION_MINUTES` (30).
 * - `updateDraft(patch)` — partial update from drag-to-move (the
 *   library's drag end fires with new resourceId / time) or from the
 *   avatar selector (technicianId only).
 * - `dismissDraft()` — explicit cancel from tap-outside, tap-existing-
 *   event, or form sheet close-without-save.
 *
 * NOT persisted — restarting the app clears the draft. This is
 * intentional: a draft is a moment-in-time intent, not data.
 */
// PLAN-DEVIATION: 2026-04-21-tap-to-create-draft — store now owns the
// draft lifecycle (was vendored library's setDraggedEventDraft + a 30s
// snapshot window). See docs/PLAN-DEVIATIONS.md#2026-04-21-tap-to-create-draft.
export interface PendingDraft {
  /** YYYY-MM-DD */
  date: string;
  /** Minutes from midnight (e.g. 600 = 10:00 AM) */
  startMinutes: number;
  /** Minutes (e.g. 30) — defaults to DEFAULT_DRAFT_DURATION_MINUTES on create */
  durationMinutes: number;
  /** null = unassigned (landscape stacked / no-tech-selected modes) */
  technicianId: number | null;
  /** Set when the user picks an option in DraftChooserPopover; null until then */
  kind: "customer" | "personal" | null;
  /** Monotonically-increasing local id for the synthetic event, so onEventPress / onDragEnd can identify it */
  draftId: string;
}

export const DEFAULT_DRAFT_DURATION_MINUTES = 30;

interface CalendarState {
  viewMode: "day" | "week" | "month";
  dragEditMode: "move" | "resize";
  selectedDate: string;
  zoomLevel: number;
  scrollPosition: number;
  selectedTechIds: number[];
  mapSelectedTechIds: number[];
  techOrder: number[];
  filterStatus: string[];
  filterSlotType: string[];
  showMap: boolean;
  calendarDensity: CalendarDensity;
  workweekTechId: number | null;
  workweekTechName: string | null;
  /**
   * User-configured default visible-range bounds (minutes from midnight).
   * The library is told to render `[displayStartMinutes, displayEndMinutes)`
   * as the visible vertical range. Persisted per device. Auto-expansion for
   * out-of-range events is computed at render time in the wrapper, NOT
   * stored here — when the offending events go away, the visible range
   * naturally collapses back to these defaults.
   */
  displayStartMinutes: number;
  displayEndMinutes: number;
  /**
   * When true (default), the calendar wrappers expand the visible range
   * at render time to cover any appointments / personal events that
   * fall outside `[displayStartMinutes, displayEndMinutes)` so they're
   * never clipped. When false, the bounds are STRICT — out-of-range
   * events get clipped at the top/bottom of the grid. Persisted.
   */
  displayAutoExpand: boolean;
  /**
   * Active multi-tech rendering treatment for the landscape WorkweekView
   * when 2+ techs are selected. Persisted. See `LandscapeMultiTechMode`
   * docstring above for the three options.
   */
  landscapeMultiTechMode: LandscapeMultiTechMode;
  /**
   * In-progress tap-to-create draft (P2-FE-5 course-corrected). Single
   * slot. NOT persisted — see `PendingDraft` docstring above.
   */
  pendingDraft: PendingDraft | null;
  /**
   * Visibility of the chooser popover (Customer / Personal) anchored
   * to the pending draft. Toggled from `onEventPress` in
   * `app/(tabs)/index.tsx` when the user taps the synthetic draft
   * event a SECOND time. Always false when `pendingDraft === null`
   * (the dismiss action keeps these in sync).
   */
  draftChooserOpen: boolean;
  /**
   * D2P-FE-14 — one-shot signal set by the demo-reset handlers in
   * `app/(tabs)/more.tsx`. When true, the next time the calendar tab
   * receives day-view / week-view data with a non-empty tech roster
   * AND `selectedTechIds` is empty, it auto-selects the first tech
   * and clears this flag. Scoped to "fresh seed just happened" — no
   * effect on cold start (handlers are the only writers; flag
   * defaults to false; not persisted). Without this, the FO calendar
   * lands on an empty grid after a reset because `selectedTechIds`
   * is session-only and starts empty by design. Per-screen UX choice
   * deliberately scoped to the post-reset flow only.
   */
  pendingAutoSelectFirstTech: boolean;
  /**
   * PR-UX-5 — Now⇄Future calendar toggle. When true, the calendar
   * canvas renders the projected post-commit world (via
   * `applyIntentsToWorld(weekData, intents)`) instead of the live
   * `weekData` / `dayData` from the BE. The user enters Future mode
   * by tapping the segmented toggle near the chip-row carousel and
   * exits by tapping it again or by leaving the calendar tab.
   *
   * NOT persisted — preview mode is moment-in-time, like
   * `pendingDraft`. Cold start always lands on Now. Future mode is
   * also force-cleared whenever the active reorganization session
   * goes empty (zero intents → nothing to project, the toggle
   * disappears).
   */
  futureMode: boolean;

  setViewMode: (mode: "day" | "week" | "month") => void;
  setDragEditMode: (mode: "move" | "resize") => void;
  toggleDensity: () => void;
  setSelectedDate: (date: string) => void;
  goToNextDay: () => void;
  goToPreviousDay: () => void;
  goToNextWeek: () => void;
  goToPreviousWeek: () => void;
  goToToday: () => void;
  setZoomLevel: (hours: number) => void;
  setScrollPosition: (minutes: number) => void;
  toggleCalendarTech: (techId: number) => void;
  clearCalendarSelection: () => void;
  /**
   * Replace the calendar tech selection wholesale (P2-FE-6 drag-to-
   * avatar). Pass `[techId]` to focus a single tech, `[]` to clear,
   * or any subset. Deduped + ordered by insertion (no implicit sort
   * — callers are expected to pass the order they want, which for
   * the drag-to-avatar drop is just `[droppedTechId]`).
   *
   * Distinct from `toggleCalendarTech` because the drop semantic is
   * "switch to this tech" — toggling would silently *remove* the
   * tech if they were already in the selection, which is the wrong
   * behavior when a card is dropped on their avatar.
   */
  setSelectedTechIds: (ids: number[]) => void;
  /** D2P-FE-14 — set/clear the post-reset auto-select-first-tech flag. */
  setPendingAutoSelectFirstTech: (pending: boolean) => void;
  /** PR-UX-5 — set Future-mode directly (true / false). */
  setFutureMode: (enabled: boolean) => void;
  /** PR-UX-5 — flip Future-mode (Now ↔ Future). */
  toggleFutureMode: () => void;
  toggleMapTech: (techId: number) => void;
  clearMapSelection: () => void;
  setTechOrder: (order: number[]) => void;
  moveTechInOrder: (techId: number, toIndex: number) => void;
  setFilterStatus: (statuses: string[]) => void;
  setFilterSlotType: (types: string[]) => void;
  toggleMap: () => void;
  enterWorkweek: (techId: number, techName: string) => void;
  exitWorkweek: () => void;
  /**
   * Set the user's default visible day range. Both args in minutes-from-midnight.
   * Clamps to [0, 1440] and enforces a minimum 60-minute window. If the args
   * are invalid (end <= start, or either out of range), the call is a no-op
   * and the previous values are kept.
   */
  setDisplayRange: (startMinutes: number, endMinutes: number) => void;
  /** Restore the default 5:00 AM – 6:00 PM visible range. */
  resetDisplayRange: () => void;
  /** Enable or disable auto-expand for out-of-range events. */
  setDisplayAutoExpand: (enabled: boolean) => void;
  /** Set the landscape multi-tech rendering treatment directly. */
  setLandscapeMultiTechMode: (mode: LandscapeMultiTechMode) => void;
  /** Cycle through the three landscape multi-tech treatments in order. */
  cycleLandscapeMultiTechMode: () => void;
  /**
   * Create a new pending draft. Replaces any existing draft. Tech id is
   * optional — null in landscape stacked-overlay / no-tech-selected
   * modes per the §5.1.7 deviation. Duration defaults to 30 min.
   */
  createDraft: (args: {
    date: string;
    startMinutes: number;
    technicianId?: number | null;
    durationMinutes?: number;
  }) => void;
  /**
   * Patch the current pending draft (e.g. on drag-to-move, on avatar
   * selector tap, on form-sheet field change). No-op when no draft.
   */
  updateDraft: (patch: Partial<Omit<PendingDraft, "draftId">>) => void;
  /**
   * P2-FE-8 — bind the pending draft to a technician. Thin wrapper
   * over `updateDraft({ technicianId })` kept as a dedicated action
   * because (a) it's the canonical entrypoint for the embedded
   * avatar selector and (b) it carries an extra log line that
   * surfaces the "ambiguous draft → bound" transition cleanly in
   * `[CAL:store]` traces. No-op when no draft.
   */
  setDraftTechnician: (technicianId: number | null) => void;
  /** Clear the pending draft. Called from tap-outside, tap-existing-event, or sheet close-without-save. Also closes the chooser. */
  dismissDraft: () => void;
  /** Open / close the chooser popover. No-op when no pending draft. */
  setDraftChooserOpen: (open: boolean) => void;
  reset: () => void;
}

const initialState = {
  viewMode: "day" as const,
  dragEditMode: "move" as const,
  selectedDate: dayjs().format("YYYY-MM-DD"),
  zoomLevel: CALENDAR_CONFIG.DEFAULT_ZOOM_HOURS,
  scrollPosition: CALENDAR_CONFIG.DEFAULT_START_HOUR * 60,
  selectedTechIds: [] as number[],
  mapSelectedTechIds: [] as number[],
  techOrder: [] as number[],
  filterStatus: [] as string[],
  filterSlotType: [] as string[],
  showMap: false,
  calendarDensity: "none" as CalendarDensity,
  workweekTechId: null as number | null,
  workweekTechName: null as string | null,
  displayStartMinutes: DEFAULT_DISPLAY_START_MINUTES,
  displayEndMinutes: DEFAULT_DISPLAY_END_MINUTES,
  displayAutoExpand: DEFAULT_DISPLAY_AUTO_EXPAND,
  landscapeMultiTechMode: DEFAULT_LANDSCAPE_MULTI_TECH_MODE,
  pendingDraft: null as PendingDraft | null,
  draftChooserOpen: false,
  pendingAutoSelectFirstTech: false,
  futureMode: false,
};

/**
 * Monotonically-increasing draft id counter. Reset is intentional — a
 * page reload restarting at 1 is fine because no two drafts coexist.
 * The id only needs to be unique within the lifetime of one draft so
 * `onEventPress` / `onDragEnd` can distinguish "this is the synthetic
 * draft event" from "this is a real appointment."
 */
let nextDraftCounter = 1;
function nextDraftId(): string {
  const id = `draft-${nextDraftCounter++}`;
  return id;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setViewMode: (mode) => {
        const prev = get().viewMode;
        traceCalendar("store.setViewMode", {
          from: prev,
          to: mode,
          futureMode: get().futureMode,
        });
        console.log("[CAL:store] setViewMode", mode);
        set({ viewMode: mode });
      },
      setDragEditMode: (mode) => set({ dragEditMode: mode }),

      setSelectedDate: (date) => { console.log("[CAL:store] setSelectedDate", date); set({ selectedDate: date }); },

      goToNextDay: () =>
        set({
          selectedDate: dayjs(get().selectedDate)
            .add(1, "day")
            .format("YYYY-MM-DD"),
        }),

      goToPreviousDay: () =>
        set({
          selectedDate: dayjs(get().selectedDate)
            .subtract(1, "day")
            .format("YYYY-MM-DD"),
        }),

      goToNextWeek: () =>
        set({
          selectedDate: dayjs(get().selectedDate)
            .add(7, "day")
            .format("YYYY-MM-DD"),
        }),

      goToPreviousWeek: () =>
        set({
          selectedDate: dayjs(get().selectedDate)
            .subtract(7, "day")
            .format("YYYY-MM-DD"),
        }),

      goToToday: () =>
        set({ selectedDate: dayjs().format("YYYY-MM-DD") }),

      setZoomLevel: (hours) =>
        set({
          zoomLevel: Math.max(
            CALENDAR_CONFIG.MIN_ZOOM_HOURS,
            Math.min(CALENDAR_CONFIG.MAX_ZOOM_HOURS, hours),
          ),
        }),

      setScrollPosition: (minutes) => set({ scrollPosition: minutes }),

      toggleCalendarTech: (techId) =>
        set((state) => {
          const ids = state.selectedTechIds;
          const next = ids.includes(techId)
            ? ids.filter((id) => id !== techId)
            : [...ids, techId];
          console.log("[CAL:store] toggleCalendarTech", { techId, prev: ids, next });
          return { selectedTechIds: next };
        }),

      clearCalendarSelection: () => {
        console.log("[CAL:store] clearCalendarSelection");
        set({ selectedTechIds: [] });
      },

      setSelectedTechIds: (ids) => {
        // Dedupe-preserving-order; integer-coerce to defend against
        // the drop hit-test ever producing a stringified key from an
        // SV-stored bbox map.
        const seen = new Set<number>();
        const next: number[] = [];
        for (const raw of ids) {
          const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
          if (!Number.isFinite(id) || seen.has(id)) continue;
          seen.add(id);
          next.push(id);
        }
        const prev = get().selectedTechIds;
        if (
          prev.length === next.length &&
          prev.every((v, i) => v === next[i])
        ) {
          // No-op write avoids a useless re-render of every Calendar
          // consumer when the drop target was already the only
          // selected tech.
          return;
        }
        console.log("[CAL:store] setSelectedTechIds", { prev, next });
        set({ selectedTechIds: next });
      },

      setPendingAutoSelectFirstTech: (pending) => {
        // D2P-FE-14 — see field docstring above. Session-only flag;
        // logged for parity with the other tech-selection mutations
        // so any "calendar landed empty after reset" report is easy
        // to bisect from CAL: traces.
        console.log("[CAL:store] setPendingAutoSelectFirstTech", pending);
        set({ pendingAutoSelectFirstTech: pending });
      },

      setFutureMode: (enabled) => {
        const next = !!enabled;
        const prev = get().futureMode;
        if (prev === next) return;
        // 2026-05-10 follow-up logging: cross-store snapshot so a future
        // regression of the "toggle disappears + can't get back" bug is
        // loud at the source. Previous log was just `("setFutureMode",
        // next)`; the surrounding state (intent count, sessionId) makes
        // the bug-2 signature visible from a single grep.
        const pending = usePendingRealityStore.getState();
        traceCalendar("store.setFutureMode", {
          from: prev,
          to: next,
          viewMode: get().viewMode,
          intentCount: pending.intents.length,
          sessionId: pending.sessionId,
          selectedChainId: pending.selectedChainId,
        });
        if (__DEV__) {
          console.log("[Calendar:Store] setFutureMode", {
            from: prev,
            to: next,
            intentCount: pending.intents.length,
            sessionId: pending.sessionId,
          });
        }
        set({ futureMode: next });
      },

      toggleFutureMode: () =>
        set((state) => {
          const next = !state.futureMode;
          const pending = usePendingRealityStore.getState();
          traceCalendar("store.toggleFutureMode", {
            from: state.futureMode,
            to: next,
            viewMode: state.viewMode,
            intentCount: pending.intents.length,
            sessionId: pending.sessionId,
            selectedChainId: pending.selectedChainId,
          });
          if (__DEV__) {
            console.log("[Calendar:Store] toggleFutureMode", {
              from: state.futureMode,
              to: next,
              intentCount: pending.intents.length,
              sessionId: pending.sessionId,
            });
          }
          return { futureMode: next };
        }),

      toggleMapTech: (techId) =>
        set((state) => {
          const ids = state.mapSelectedTechIds;
          const next = ids.includes(techId)
            ? ids.filter((id) => id !== techId)
            : [...ids, techId];
          console.log("[CAL:store] toggleMapTech", { techId, prev: ids, next });
          return { mapSelectedTechIds: next };
        }),

      clearMapSelection: () => {
        console.log("[CAL:store] clearMapSelection");
        set({ mapSelectedTechIds: [] });
      },

      setTechOrder: (order) => {
        console.log("[CAL:store] setTechOrder", order);
        set({ techOrder: order });
      },

      moveTechInOrder: (techId, toIndex) =>
        set((state) => {
          const current = state.techOrder.includes(techId)
            ? state.techOrder
            : [...state.techOrder, techId];
          const without = current.filter((id) => id !== techId);
          const clamped = Math.max(0, Math.min(toIndex, without.length));
          const next = [...without.slice(0, clamped), techId, ...without.slice(clamped)];
          console.log("[CAL:store] moveTechInOrder", { techId, toIndex, prev: current, next });
          return { techOrder: next };
        }),

      setFilterStatus: (statuses) => set({ filterStatus: statuses }),

      setFilterSlotType: (types) => set({ filterSlotType: types }),

      toggleMap: () => set((state) => { console.log("[CAL:store] toggleMap →", !state.showMap); return { showMap: !state.showMap }; }),

      toggleDensity: () => set((state) => {
        const idx = DENSITY_CYCLE.indexOf(state.calendarDensity);
        const next = DENSITY_CYCLE[(idx + 1) % DENSITY_CYCLE.length];
        console.log("[CAL:store] toggleDensity →", next);
        return { calendarDensity: next };
      }),

      enterWorkweek: (techId, techName) => { console.log("[CAL:store] enterWorkweek", { techId, techName }); set({ workweekTechId: techId, workweekTechName: techName, viewMode: "week" }); },
      exitWorkweek: () => { console.log("[CAL:store] exitWorkweek"); set({ workweekTechId: null, workweekTechName: null, viewMode: "day" }); },

      setDisplayRange: (startMinutes, endMinutes) => {
        const start = Math.round(startMinutes);
        const end = Math.round(endMinutes);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end > 1440 ||
          end - start < MIN_DISPLAY_RANGE_MINUTES
        ) {
          console.warn("[CAL:store] setDisplayRange rejected invalid bounds", { startMinutes, endMinutes });
          return;
        }
        console.log("[CAL:store] setDisplayRange", { start, end });
        set({ displayStartMinutes: start, displayEndMinutes: end });
      },

      resetDisplayRange: () => {
        console.log("[CAL:store] resetDisplayRange");
        set({
          displayStartMinutes: DEFAULT_DISPLAY_START_MINUTES,
          displayEndMinutes: DEFAULT_DISPLAY_END_MINUTES,
        });
      },

      setDisplayAutoExpand: (enabled) => {
        console.log("[CAL:store] setDisplayAutoExpand", enabled);
        set({ displayAutoExpand: !!enabled });
      },

      setLandscapeMultiTechMode: (mode) => {
        if (!LANDSCAPE_MULTI_TECH_MODES.includes(mode)) {
          console.warn("[CAL:store] setLandscapeMultiTechMode rejected unknown mode", mode);
          return;
        }
        console.log("[CAL:store] setLandscapeMultiTechMode", mode);
        set({ landscapeMultiTechMode: mode });
      },

      cycleLandscapeMultiTechMode: () =>
        set((state) => {
          const idx = LANDSCAPE_MULTI_TECH_MODES.indexOf(state.landscapeMultiTechMode);
          const next = LANDSCAPE_MULTI_TECH_MODES[(idx + 1) % LANDSCAPE_MULTI_TECH_MODES.length];
          console.log("[CAL:store] cycleLandscapeMultiTechMode", { prev: state.landscapeMultiTechMode, next });
          return { landscapeMultiTechMode: next };
        }),

      // PLAN-DEVIATION: 2026-04-21-tap-to-create-draft — see
      // docs/PLAN-DEVIATIONS.md#2026-04-21-tap-to-create-draft
      createDraft: ({ date, startMinutes, technicianId = null, durationMinutes }) => {
        // P3-FE-6: if a previous draft is being replaced (user tapped
        // a new cell without dismissing the old one), evict the
        // outgoing draft's form cache so its abandoned typing doesn't
        // linger in memory until session end. The new draft gets a
        // fresh `draftId`, so its cache key won't collide either way
        // — this is a pure tidy-up.
        const existing = get().pendingDraft;
        if (existing) {
          useSheetDraftStore
            .getState()
            .clearForDraft(sheetDraftCacheKey.draft(existing.draftId));
        }
        const draft: PendingDraft = {
          date,
          startMinutes: Math.round(startMinutes),
          durationMinutes: Math.max(
            5,
            Math.round(durationMinutes ?? DEFAULT_DRAFT_DURATION_MINUTES),
          ),
          technicianId: technicianId ?? null,
          kind: null,
          draftId: nextDraftId(),
        };
        console.log("[CAL:store] createDraft", draft);
        set({ pendingDraft: draft, draftChooserOpen: false });
      },

      updateDraft: (patch) =>
        set((state) => {
          if (!state.pendingDraft) {
            console.warn("[CAL:store] updateDraft no-op (no pending draft)");
            return {};
          }
          const next: PendingDraft = { ...state.pendingDraft, ...patch };
          if (patch.startMinutes !== undefined) {
            next.startMinutes = Math.round(patch.startMinutes);
          }
          if (patch.durationMinutes !== undefined) {
            next.durationMinutes = Math.max(5, Math.round(patch.durationMinutes));
          }
          console.log("[CAL:store] updateDraft", { prev: state.pendingDraft, next });
          return { pendingDraft: next };
        }),

      setDraftTechnician: (technicianId) =>
        set((state) => {
          if (!state.pendingDraft) {
            console.warn("[CAL:store] setDraftTechnician no-op (no pending draft)");
            return {};
          }
          if (state.pendingDraft.technicianId === technicianId) return {};
          console.log("[CAL:store] setDraftTechnician", {
            prev: state.pendingDraft.technicianId,
            next: technicianId,
            draftId: state.pendingDraft.draftId,
          });
          return {
            pendingDraft: { ...state.pendingDraft, technicianId },
          };
        }),

      dismissDraft: () => {
        const draft = get().pendingDraft;
        if (!draft && !get().draftChooserOpen) return;
        console.log("[CAL:store] dismissDraft");
        // P3-FE-6: when the underlying draft event is dismissed,
        // evict any cached form-sheet contents keyed to it. Without
        // this, a tap-to-create → form-sheet typing → dismiss-draft
        // → re-tap-to-create cycle would silently rehydrate the
        // PREVIOUS draft's typing into the new draft's form. The
        // cache is keyed by `draft:<draftId>` (a fresh id per
        // create), so clearing the old id never disturbs a future
        // one. See `docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6`.
        if (draft) {
          useSheetDraftStore
            .getState()
            .clearForDraft(sheetDraftCacheKey.draft(draft.draftId));
        }
        set({ pendingDraft: null, draftChooserOpen: false });
      },

      setDraftChooserOpen: (open) => {
        const state = get();
        if (!state.pendingDraft && open) {
          console.warn("[CAL:store] setDraftChooserOpen(true) ignored — no pending draft");
          return;
        }
        if (state.draftChooserOpen === open) return;
        console.log("[CAL:store] setDraftChooserOpen", open);
        set({ draftChooserOpen: open });
      },

      reset: () => set({ ...initialState, selectedDate: dayjs().format("YYYY-MM-DD") }),
    }),
    {
      name: "@calendar/view-state",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        zoomLevel: state.zoomLevel,
        techOrder: state.techOrder,
        calendarDensity: state.calendarDensity,
        displayStartMinutes: state.displayStartMinutes,
        displayEndMinutes: state.displayEndMinutes,
        displayAutoExpand: state.displayAutoExpand,
        landscapeMultiTechMode: state.landscapeMultiTechMode,
      }),
      // Hydration migration: Ship 2 persisted `"stacked-bands"` as a
      // valid value; Ship 3 cut that treatment. If the rehydrated
      // value isn't one of the current enum members, fall back to the
      // default so the store doesn't carry a now-invalid string.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<CalendarState>) };
        if (!isLandscapeMultiTechMode(merged.landscapeMultiTechMode)) {
          merged.landscapeMultiTechMode = DEFAULT_LANDSCAPE_MULTI_TECH_MODE;
        }
        return merged;
      },
    },
  ),
);
