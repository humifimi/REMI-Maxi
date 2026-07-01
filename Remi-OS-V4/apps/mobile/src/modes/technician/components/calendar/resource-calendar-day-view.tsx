import React, {
  type ReactNode,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import {
  Calendar,
  useCalendarBinding,
  type Event as RCEvent,
  type Resource,
  type DraggedEventDraft,
} from "react-native-resource-calendar";
import type { SharedValue } from "react-native-reanimated";
import { useMoveChainScrollLogger } from "@technician/components/calendar/use-move-chain-scroll-logger";

export function useClearSelectionOnUnmount() {
  const { useSetSelectedEvent, useSetDraggedEventDraft } = useCalendarBinding();
  const setSelectedEvent = useSetSelectedEvent();
  const setDraft = useSetDraggedEventDraft();
  useEffect(() => {
    return () => {
      setSelectedEvent(null);
      setDraft(null);
    };
  }, [setSelectedEvent, setDraft]);
}

/**
 * `useClearSelectionOnTechChange` — clears the calendar binding's
 * `selectedEvent` and `draggedEventDraft` whenever the supplied
 * `techId` changes between renders.
 *
 * # Why this exists (PR-UX-8, 2026-05-09)
 *
 * The portrait workweek view (`ResourceCalendarWorkweekView`) is
 * mounted INSIDE a stable `<CalendarBindingProvider key="cal-week">`
 * in `app/(tabs)/index.tsx`. When the user taps a different tech's
 * avatar to "browse" their schedule, `useCalendarStore.enterWorkweek`
 * updates `workweekTechId` and the workweek view re-renders with a
 * new `techId` prop — but the `CalendarBindingProvider` does NOT
 * remount, so the Zustand binding's `selectedEvent` survives the
 * tech change.
 *
 * The user-reported repro:
 *
 *   "I picked up a card by double tapping, which lets the card
 *    hover over the calendar before I start to move it, and then
 *    I tapped into another tech's calendar by tapping their avatar
 *    (without holding the appointment card there, it was still
 *    back where it started, hovering still) and the card moved
 *    with me from calendar to calendar."
 *
 * The pickup gesture writes `selectedEvent` (via
 * `setSelectedEvent` inside the vendored library's `internalOnDoubleTap`).
 * A subsequent pan in the new tech's column inherits that
 * `selectedEvent` because it's still set, and `finalizeDrag`
 * commits the move to the new tech — completing a drag the user
 * never intended.
 *
 * The avatar-tap gesture is a "browse the destination calendar,
 * then come back if I don't want to drop here" affordance, NOT
 * "carry the held card across techs." Clearing `selectedEvent`
 * on `techId` change makes the gesture unambiguous: if you want
 * to carry the card, drag it (the existing dwell pattern handles
 * that). If you want to browse, tap. The two never conflate.
 *
 * # Why a `useEffect` and not a deeper rewrite
 *
 * `selectedEvent` lives in the vendored library's per-binding
 * Zustand store and the library mutates it itself from inside
 * `internalOnDoubleTap`. We can't intercept the gesture there
 * without re-forking the library. The thinnest layer that owns
 * "the user changed which tech the workweek is showing" is the
 * workweek view itself, which already takes `techId` as a prop.
 *
 * # When NOT to clear
 *
 * Don't clear on EVERY render — that breaks the legitimate
 * pickup → drag → finalize flow within the same tech (where
 * `techId` is stable across the entire gesture). The effect
 * fires only on the `techId` dep transition, which is exactly
 * the avatar-tap path.
 *
 * Don't clear when the long-press / quick-action toast cancels
 * the gesture — that flow already clears via the toast's
 * `setSelectedEvent(null)` call AND the library's own
 * `selectedEvent`-changed effect (which clears
 * `draggedEventDraft` + `dragReady` when `selectedEvent` flips
 * to null). This effect is additive, not a replacement.
 */
// PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
// strengthen the active-drag guard so it also covers the
// pre-pan window between pickup and the first frame of the
// pan gesture. See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups.
export function useClearSelectionOnTechChange(techId: number) {
  const {
    useSetSelectedEvent,
    useSetDraggedEventDraft,
    useGetDraggedEventDraft,
    useGetSelectedEvent,
  } = useCalendarBinding();
  const setSelectedEvent = useSetSelectedEvent();
  const setDraft = useSetDraggedEventDraft();
  // PR-UX-15 (2026-05-09) — gate the clear on "no active drag." The
  // PR-UX-8 fix that introduced this hook didn't account for the
  // cross-tech hover-dwell drag flow, where `techId` changes WHILE
  // the user is mid-drag (their finger is still on screen, the pan
  // gesture is in flight, and an avatar dwell triggered
  // `enterWorkweek(...)`). Clearing `selectedEvent` mid-pan
  // poisons `finalizeDrag` — the gesture's `pan:end:finalize` reads
  // `hasSelectedEvent: false` and the drop is silently lost
  // (`[RC DRAG] draft has no event, ignoring`).
  //
  // PR-UX-16 (2026-05-09) — broaden the guard from "draft != null"
  // to "draft != null OR selectedEvent != null." The PR-UX-15 fix
  // assumed the draft would be set the moment the user starts a
  // cross-tech drag, but the avatar hover-dwell flow trips
  // `enterWorkweek` on the FIRST avatar dwell — which can happen
  // BEFORE the user's finger has moved enough to materialize a
  // `draggedEventDraft` (the library only writes the draft once the
  // pan exceeds a small movement threshold). Logs from the user
  // confirm: pickup writes `selectedEvent`, dragReady=true,
  // pan:dragStart fires, then `enterWorkweek` lands while
  // `draggedEventDraft` is still null. The PR-UX-15 guard didn't
  // fire in that window and the clear killed the in-flight drag.
  //
  // `selectedEvent` is the load-bearing signal — once it's set, a
  // drag is "live" regardless of whether the draft has rendered
  // yet. The release path (pickup → release without dragging) ALSO
  // sets selectedEvent, but the user explicitly asked for "browse"
  // semantics in that path; if a future case demands clearing on
  // the no-pan release, add a third "isDragging" boolean from the
  // library — don't drop this guard.
  //
  // We capture the latest values via refs so the effect's dep set
  // stays minimal — the effect should fire on `techId`
  // transitions, not on every per-frame draft update.
  const draggedDraft = useGetDraggedEventDraft();
  const draggedDraftRef = useRef(draggedDraft);
  useEffect(() => {
    draggedDraftRef.current = draggedDraft;
  }, [draggedDraft]);
  const selectedEvent = useGetSelectedEvent();
  const selectedEventRef = useRef(selectedEvent);
  useEffect(() => {
    selectedEventRef.current = selectedEvent;
  }, [selectedEvent]);
  // Track the `techId` we last cleared for so we can no-op on
  // initial mount (where `techId` is the first value we see).
  // Without this guard, the effect fires once on mount with no
  // prior selection, which is a harmless no-op but pollutes
  // `[gesture] selectedEvent changed` logs with a spurious
  // `hasEvent: false` line for every new workweek mount.
  const prevTechIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevTechIdRef.current === null) {
      prevTechIdRef.current = techId;
      return;
    }
    if (prevTechIdRef.current === techId) return;
    prevTechIdRef.current = techId;
    // PR-UX-16: skip the clear if a drag is selected (and possibly
    // active). The drag path is the legitimate cross-tech
    // hover-dwell flow; preserving the selection lets
    // `finalizeDrag` commit the drop on the destination tech.
    if (
      draggedDraftRef.current != null ||
      selectedEventRef.current != null
    ) {
      if (__DEV__) {
        console.log(
          "[CAL:weekView] tech change during active drag — preserving selection",
          {
            techId,
            hasDraft: draggedDraftRef.current != null,
            hasSelected: selectedEventRef.current != null,
          },
        );
      }
      return;
    }
    if (__DEV__) {
      console.log(
        "[CAL:weekView] clearing selectedEvent + draft on tech change",
        { techId },
      );
    }
    setSelectedEvent(null);
    setDraft(null);
  }, [techId, setSelectedEvent, setDraft]);
}
import {
  mapDayResponseToResources,
  getAppointmentFromEvent,
  isPersonalEvent,
  isDraftEvent,
  getEventColor,
  computeEffectiveDisplayRange,
  padRangeToFillViewport,
} from "@technician/utils/resource-calendar-mapping";
import { useResourcesWithDraft } from "@technician/components/calendar/FloatingDraftCard";
import { useResourcesWithMoveChainGhosts } from "@technician/components/calendar/move-chain-ghost-tiles";
import { colorForTech } from "@technician/utils/color-for-tech";
import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";
import { SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import type {
  CalendarDayResponse,
  CalendarAppointmentItem,
} from "@technician/types/calendar";
import type { StyleOverrides } from "react-native-resource-calendar";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { applyPendingChangeBorderOverride } from "@technician/components/calendar/pending-change-overlay-style";
import { useKnownReorganizationSessionIds } from "@technician/hooks/calendar/use-known-reorganization-session-ids";
import { applyMoveChainBorderOverride } from "@technician/components/calendar/move-chain-overlay-style";
import { resolveMoveChainPulse } from "@technician/components/calendar/move-chain-pulse-resolver";
import { useMoveChainPulse } from "@technician/components/calendar/use-move-chain-pulse";
import { useMoveChainGraph } from "@technician/components/calendar/use-move-chain-graph";
import { useAutoIsolateOnStage } from "@technician/components/calendar/use-auto-isolate-on-stage";
import { MoveChainChipRow } from "@technician/components/calendar/MoveChainChipRow";
import { CalendarDateNavRow } from "@technician/components/calendar/CalendarDateNavRow";
import { WorkweekBackBar } from "@technician/components/calendar/WorkweekBackBar";
import { MoveChainArrowOverlay } from "@technician/components/calendar/MoveChainArrowOverlay";
import { computeMoveChainArrows } from "@technician/components/calendar/compute-move-chain-arrows";
import { useEventBoundsRegistry } from "@technician/hooks/calendar/use-event-bounds-registry";
import {
  getVisibleMoveChainDestSlots,
} from "@technician/utils/detect-move-chains";
import { PendingChangeBadge } from "@technician/components/calendar/PendingChangeBadge";
import type { ReorganizationIntent } from "@technician/types/reorganization";

// PR-UX-5 (2026-05-08) — stable empty-intents reference so the
// "future mode = pretend no intents" short-circuit doesn't churn
// memoized chain hooks every render.
const EMPTY_INTENTS: ReorganizationIntent[] = [];

// Pick black or white text for legibility on a saturated tech color.
// Same threshold as the landscape overlay's local helper (kept inline
// here to avoid a shared-utility detour while we ship the palette
// shift). If a third site needs this, extract it then.
function readableTextOn(color: string): "#111827" | "#FFFFFF" {
  const match = /^#?([A-Fa-f0-9]{6})$/.exec(color);
  if (!match) return "#FFFFFF";
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.70 ? "#111827" : "#FFFFFF";
}

interface Props {
  dayData: CalendarDayResponse | undefined;
  /**
   * Week-window data used **only** for chain-graph derivation
   * (`useMoveChainGraph`), not for resource rendering. The chain
   * detector needs the SOURCE appointment for every staged intent;
   * when an intent reschedules an appointment that lives on a
   * different day than `selectedDate`, the per-day response is
   * missing the source row and the detector quietly drops or
   * mis-classifies the intent's chain. The Pending Reality review
   * screen always feeds the detector from `useFranchiseWeekView` —
   * this prop lets the day view do the same so the chip row and
   * the review's per-card badge produce byte-identical chain
   * graphs for the same intent set.
   *
   * Optional. Tech-side mounts (no franchise reorganization
   * intents) can leave it `undefined`; the empty intents list
   * short-circuits the hook to the empty graph anyway, and the
   * chip row's render gate (`weekData != null || intents.length
   * === 0`) keeps the row hidden either way. The franchise mount
   * gates `weekQuery` enable on `hasStagedIntents` so the moment
   * the first intent is staged the query starts; while the
   * response is in flight the chip row hides instead of painting
   * a transient under-counted graph from the per-day response.
   * See `use-move-chain-graph.ts` history note (c) for the bug
   * this gate closes.
   */
  weekData?: CalendarDayResponse[] | undefined;
  selectedDate: string;
  hourHeight: number;
  numberOfColumns?: number;
  /** Persistent global tech ordering (from calendar store). */
  techOrder?: number[];
  /**
   * Multi-select tech filter (session-only, from calendar store).
   * Empty / undefined = all techs visible. When non-empty, the library
   * hides unselected columns from the body but keeps all avatars in the
   * header (dimmed for unselected).
   */
  selectedTechIds?: number[];
  /**
   * Measured pixel height of the calendar's parent viewport. Used to
   * pad the visible time range so the grid always fills to the bottom
   * of its container (added 2026-04-22, P2-FE-5 chunk 2c follow-up).
   * Pass 0 / undefined to disable the fill behavior — the view will
   * size strictly from `[startMinutes, endMinutes)`.
   */
  viewportHeight?: number;
  onZoom?: (newHeight: number) => void;
  onEventPress?: (event: RCEvent) => void;
  onEventLongPress?: (event: RCEvent) => void;
  onResourcePress?: (resource: Resource) => void;
  /** Double-tap on an avatar (from forked header). */
  onResourceDoublePress?: (resource: Resource) => void;
  /** Hold-drag-release reorder callback (from forked header). */
  onResourceReorder?: (orderedIds: number[]) => void;
  onBlockTap?: (resource: Resource, date: Date) => void;
  onBlockLongPress?: (resource: Resource, date: Date) => void;
  onDragEnd?: (draft: DraggedEventDraft) => void;
  /**
   * 2026-05-10 user fix: optional render slot stacked beneath the
   * dot row INSIDE the `<MoveChainChipRow>`. Forwarded verbatim to
   * `MoveChainChipRow.bottomSlot`. The franchise mount in
   * `app/(tabs)/index.tsx` passes `<NowFutureToggle />` here so the
   * toggle nests inside the chip row's white pill — replaces the
   * sibling-above-the-canvas placement that left the user with
   * unused white space at the bottom of the pill they couldn't
   * eliminate via padding alone. Tech-side mounts (no franchise
   * reorganization intents) leave this `undefined` and the chip
   * row renders without the slot.
   */
  chipRowBottomSlot?: ReactNode;
}

export function ResourceCalendarDayView({
  dayData,
  weekData,
  selectedDate,
  hourHeight,
  numberOfColumns,
  techOrder,
  selectedTechIds,
  viewportHeight,
  onZoom,
  onEventPress,
  onEventLongPress,
  onResourcePress,
  onResourceDoublePress,
  onResourceReorder,
  onBlockTap,
  onBlockLongPress,
  onDragEnd,
  chipRowBottomSlot,
}: Props) {
  useClearSelectionOnUnmount();

  const baseResources = useMemo(() => {
    if (!dayData) return [];
    const mapped = mapDayResponseToResources(dayData, { techOrder });
    // 2026-05-07 follow-up — gated to keep the per-render log volume
    // bounded; flip `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1` for diagnostic
    // captures.
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[CAL:dayView] mapped resources", {
        count: mapped.length,
        totalEvents: mapped.reduce((s, r) => s + r.events.length, 0),
        date: dayData.date,
        techOrderLen: techOrder?.length ?? 0,
        selectedLen: selectedTechIds?.length ?? 0,
      });
    }
    return mapped;
  }, [dayData, techOrder, selectedTechIds]);

  // P2-FE-5 (course-corrected 2026-04-21): inject the in-flight
  // pending draft as a synthetic event. No-op when no draft.
  const resourcesWithDraft = useResourcesWithDraft(baseResources);

  const dateObj = useMemo(() => new Date(selectedDate + "T00:00:00"), [selectedDate]);

  // User's persisted default visible-range bounds (set in Settings).
  const defaultStart = useCalendarStore((s) => s.displayStartMinutes);
  const defaultEnd = useCalendarStore((s) => s.displayEndMinutes);
  const autoExpand = useCalendarStore((s) => s.displayAutoExpand);

  // Effective range. When "Fit to events" is ON (default), the visible
  // window is the actual span of today's events snapped to 30-minute
  // boundaries (falling back to the user's defaults on an empty day).
  // When OFF, the user's chosen bounds are strict and out-of-range
  // events get clipped at the edges of the grid. Recomputed on every
  // dayData change, so when an event is added/moved/removed the
  // calendar reshapes itself automatically (fit mode only).
  const { startMinutes, endMinutes } = useMemo(() => {
    const base = autoExpand
      ? computeEffectiveDisplayRange(dayData ? [dayData] : undefined, defaultStart, defaultEnd)
      : { startMinutes: defaultStart, endMinutes: defaultEnd };
    // 2026-04-22 fill-to-bottom: pad the range so the grid spans the
    // measured viewport. Applies whether or not auto-expand is on —
    // both modes can leave white space below when the user-set range
    // (or fitted span) is shorter than the screen.
    return padRangeToFillViewport(
      base.startMinutes,
      base.endMinutes,
      viewportHeight ?? 0,
      hourHeight,
    );
  }, [dayData, defaultStart, defaultEnd, autoExpand, viewportHeight, hourHeight]);

  // P3-FE-8 (C.12): subscribe to the local pending-reality store
  // here (Rules of Hooks bans hook calls inside the memoized
  // `eventStyleOverrides` callback) and pipe the slices into the
  // dashed-border helper. The TopRight `PendingChangeBadge` slot
  // does its own subscription via `usePendingChangeOverlay` since
  // it's a React component the calendar mounts per event.
  const localIntentsRaw = usePendingRealityStore((s) => s.intents);
  const localSessionId = usePendingRealityStore((s) => s.sessionId);
  // PLAN-DEVIATION: 2026-05-11-toggle-stays-in-chip-row — see
  // docs/PLAN-DEVIATIONS.md#2026-05-11-toggle-stays-in-chip-row.
  // PR-UX-5 (2026-05-08) introduced an `EMPTY_INTENTS` short-circuit
  // here that suppressed every chain-driven downstream signal in
  // Future mode (chip-row carousel, ghost destinations, arrows all
  // hid themselves "because the chains visually collapse into the
  // projected positions"). That had the side-effect of unmounting
  // the chip row, which yanked the `<NowFutureToggle />` hosted in
  // its `chipRowBottomSlot` along with it — stranding the user in
  // Future mode with no toggle to escape.
  // User 2026-05-11: "JUST toggle the look of the toggle, you don't
  // need to disappear or change anything else visually when it's
  // toggled." Canvas projection still happens via the parent
  // `dayDataForCanvas` / `weekDataForCanvas` substitution — but the
  // chip row, dots, chain pills, and the toggle itself all stay
  // mounted in Future mode. Just use `localIntentsRaw` directly.
  const futureMode = useCalendarStore((s) => s.futureMode);
  const localIntents = localIntentsRaw;
  // PR-UX-2 PASS 2.18 (2026-05-05): set of reorganization session ids
  // the device has local knowledge of (local store + FO's
  // pending-review franchise list). Used by the cyan-tile suppression
  // branch in `applyPendingChangeBorderOverride` so stale BE
  // annotations referencing sessions the user can't see anywhere
  // else stop painting orphan blue cards on the calendar. `null`
  // preserves legacy behavior; technicians and in-flight FO list
  // states return `null`.
  const knownSessionIds = useKnownReorganizationSessionIds();
  const selectedChainId = usePendingRealityStore((s) => s.selectedChainId);
  const setSelectedChainId = usePendingRealityStore((s) => s.setSelectedChainId);
  // PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set. See
  // workweek-view's matching block for the full rationale.
  const chainStepHighlights = usePendingRealityStore(
    (s) => s.chainStepHighlights,
  );
  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — aux highlight
  // set for the chain-to-chain conflict toast (PR-UX-16 issues #4
  // + #5). When non-empty, additional chains paint their
  // highlights / ghosts alongside the primary `selectedChainId`.
  // Cleared to `[]` outside the toast lifetime; cheap when empty.
  const auxHighlightedChainIds = usePendingRealityStore(
    (s) => s.auxHighlightedChainIds,
  );

  // PR-UX-2 PASS 2.3.1 (2026-05-05): host the pulse-singleton
  // subscription at the view level so it's gated on "is a chain
  // selected?" rather than "did the arrow overlay decide to render
  // any arrows?". See MoveChainArrowOverlay's doc-block for the
  // failure mode this fixes (create-only chains have a ghost but no
  // arrow → overlay returns null → pulse used to die).
  useMoveChainPulse(selectedChainId !== null, "view:day");

  // Move-chain selector PASS 1 — derive the chain graph for this
  // view. Memoization keys on the appointment-source ref and on the
  // intents array reference, matching the same memoization contract
  // `useCalendarWorldSnapshot` follows. Returns the empty graph when
  // no intents are staged so the per-event overlay short-circuits to
  // a no-op.
  //
  // 2026-05-08 follow-up: routed through `useMoveChainGraph` so the
  // chip row and the Pending Reality review screen's per-card
  // "Chain N" badge both source from the SAME seam.
  //
  // 2026-05-08 follow-up #3 (this file): the detector reads ONLY
  // `weekData`. The earlier follow-up #2 had `weekData ?? dayData`
  // as a fallback for the franchise mount's transient
  // `weekQuery.data === undefined` window after `hasStagedIntents`
  // flipped from false → true, but that fallback was the wedge that
  // kept reproducing the chip-row vs review-screen chain divergence:
  //
  //   - The franchise day view's `dayData` (`useFranchiseDayView`)
  //     covers ONLY `selectedDate`. Any staged intent whose source
  //     appointment lives on another day in the same week has no
  //     source-slot projection in `linterAppointments` when fed
  //     from `dayData`, so the detector silently produces an
  //     under-counted chain graph (chains involving cross-day
  //     intents collapse or split off into 1-step seeds).
  //   - The review screen NEVER falls back to `dayData` — it always
  //     reads from `useFranchiseWeekView`. So the moment the chip
  //     row's hook ate `dayData` (because `weekData` was still
  //     loading), the two surfaces diverged.
  //   - The `weekQuery` is gated on `hasStagedIntents`, so it
  //     enables the moment the first intent is staged — but the
  //     fetch itself isn't instantaneous, and the user can stage
  //     several intents inside the loading window before the
  //     response lands. The chip row's first paint with
  //     `weekData=undefined` leaked the wrong graph into a memo
  //     state that subsequent staged intents inherited (because
  //     `linterAppointments` was already pinned to the dayData
  //     projection until the next reference change).
  //
  // Removing the fallback closes the asymmetry. While `weekData`
  // is loading the hook returns 1-step seeds for each intent (per
  // `useMoveChainGraph`'s contract); the chip-row gate below
  // (`weekData != null || localIntents.length === 0`) hides the
  // chip row in that window so the user never sees the transient
  // disconnected-chips flash. Once the week query resolves, the
  // chip row paints with the same chain graph the review screen
  // produces — by construction.
  //
  // Tech-side mounts pass `weekData={undefined}` and have no
  // franchise reorganization intents, so the gate evaluates to
  // `localIntents.length === 0` and the chip row short-circuits
  // to hidden anyway. Behavior on tech mounts is unchanged.
  const { graph: moveChainGraph, linterAppointments } = useMoveChainGraph(
    localIntents,
    weekData,
  );

  // PR-UX-3 follow-up #3 (2026-05-08): chip-row paint gate. We
  // hide the chip row entirely while the chain detector is
  // operating against a transient `weekData=undefined` input AND
  // intents are staged — otherwise a flash of 1-step-per-intent
  // chips paints between staging and the week query resolving.
  // Once `weekData` lands the gate flips and the chip row paints
  // with the correct graph in lockstep with the review screen.
  // Tech-side mounts (no franchise intents) hit the
  // `localIntents.length === 0` branch and render normally.
  const chainGraphReady =
    localIntents.length === 0 || weekData != null;

  // 2026-05-08 follow-up #4 (PR-UX-3 bug #2): auto-isolate the
  // just-staged chain. After every successful stage,
  // `useAddReorganizationIntent`'s `onSuccess` calls
  // `setSession(refresh+intents)` which clobbers `selectedChainId`
  // to null (introduced in PR-UX-2 / `72c6fc4`). The user reported
  // this as "when I moved Ethan's card, it shows pretty much all
  // of the pending changes, not just for that chain" — without an
  // isolated chain the calendar paints every staged change with
  // the dashed pending border and no dimming, so the user can't
  // visually verify what their drag did. The hook re-isolates the
  // newly-added intent's chain on every stage. See the hook's
  // doc-block for why it lives in a hook (shared by day +
  // workweek + landscape views) and why we don't move the reset
  // out of `setSession` itself.
  const setChainStepHighlights = usePendingRealityStore(
    (s) => s.setChainStepHighlights,
  );
  useAutoIsolateOnStage({
    intents: localIntents,
    graph: moveChainGraph,
    selectedChainId,
    chainStepHighlights,
    setSelectedChainId,
    setChainStepHighlights,
  });

  // 2026-05-13 — Future-mode ghost / arrow / border-override
  // suppression. See workweek-view's matching block for the full
  // rationale: when the canvas shows the projected world, every
  // staged appointment has already been moved to its destination,
  // so painting a ghost AT the same destination is a duplicate
  // visual and an arrow source = destination is degenerate.
  const effectiveSelectedChainId = futureMode ? null : selectedChainId;

  // PR-UX-2 PASS 2: inject move-chain ghost destination tiles for
  // each in-scope chain intent. No-op when `selectedChainId` is null
  // (Show all baseline) or when there are no intents at all.
  const resources = useResourcesWithMoveChainGhosts(
    resourcesWithDraft,
    moveChainGraph,
    localIntents,
    linterAppointments,
    effectiveSelectedChainId,
    chainStepHighlights,
    undefined,
    auxHighlightedChainIds,
  );

  // Currently-rendered chain destination slots — used by the border
  // override to exempt cards sitting under an active ghost from the
  // dim treatment (canvas Decision 1 / PR-UX-2 PASS 2.6).
  const visibleDestSlots = useMemo(
    () =>
      getVisibleMoveChainDestSlots(
        moveChainGraph,
        localIntents,
        linterAppointments,
        effectiveSelectedChainId,
        chainStepHighlights,
        auxHighlightedChainIds,
      ),
    [
      chainStepHighlights,
      moveChainGraph,
      localIntents,
      linterAppointments,
      effectiveSelectedChainId,
      auxHighlightedChainIds,
    ],
  );

  useEffect(() => {
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[CAL:dayView] render", { selectedDate, resourceCount: resources.length, hasDayData: !!dayData });
    }
  }, [selectedDate, resources.length, dayData]);

  // 2026-05-08 follow-up #4 (chip-row staleness diagnostic) —
  // unconditional `__DEV__` log of the inputs the day view is
  // about to forward into the chip row's render. Pairs with
  // `[DEBUG:useMoveChainGraph] recompute` (the hook output) and
  // `[DEBUG:ChipRow] render` (the consumer side). The triplet
  // disambiguates "hook produced a fresh graph but the day view
  // didn't re-render" (this log doesn't fire) from "day view
  // re-rendered with the fresh graph but the chip row paints a
  // stale one" (this log fires with chainCount=N, the chip row's
  // log fires with chainCount=K!=N) from "everything is fine,
  // bug is elsewhere" (this log AND the chip row's log fire
  // with the same shape, user still reports staleness).
  // Production bundles strip the call entirely. See follow-up
  // #4 dev-log entry for the diagnostic protocol.
  if (__DEV__) {
    console.log("[DEBUG:DV:render]", {
      selectedDate,
      localIntentCount: localIntents.length,
      localIntentIds: localIntents.map((i) => i.id),
      weekDataPresent: weekData != null,
      weekDataDayCount: weekData?.length ?? 0,
      chainGraphReady,
      chainCount: moveChainGraph.chains.length,
      chainIds: moveChainGraph.chains.map((c) => c.id),
      ecosystemCount: moveChainGraph.ecosystems.length,
      selectedChainId,
    });
  }

  // PR-UX-2 PASS 2.2: arrow overlay geometry. Day view shows N tech
  // columns for one date. The visible columns come from `resources`
  // (already filtered + ordered by parent). `numberOfColumns` controls
  // how many fit in the viewport before horizontal scrolling kicks in;
  // the geometry helper uses the same denominator as the calendar
  // does for `APPOINTMENT_BLOCK_WIDTH`.
  const visibleResourceIds = useMemo(
    () => resources.map((r) => ({ id: Number(r.id) })),
    [resources],
  );
  const [calendarFrame, setCalendarFrame] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const calendarWrapperRef = useRef<View>(null);
  const onCalendarLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[MoveChain:Layout:Day] onLayout", { w, h });
    }
    // Resolve absolute screen position of the wrapper so we can
    // verify what we think we're rendering vs. what the user sees.
    if (VERBOSE_CALENDAR_LOGS) {
      calendarWrapperRef.current?.measureInWindow((x, y, ww, hh) => {
        console.log("[MoveChain:Wrapper:Pos:Day]", { x, y, w: ww, h: hh });
      });
    }
    setCalendarFrame((prev) =>
      prev.w === w && prev.h === h ? prev : { w, h },
    );
  }, []);
  // FORK Phase 24 plumb: hold the calendar's internal scrollY SV so
  // the overlay (and any future scroll-aware sibling) can subscribe.
  // useState (not useRef) so the overlay re-renders once it's set.
  const [calendarScrollY, setCalendarScrollY] = useState<SharedValue<number> | null>(null);
  const onScrollYRef = useCallback((sv: SharedValue<number>) => {
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[MoveChain:ScrollSV:Day] received", {
        hasSV: !!sv,
        initialValue: sv?.value ?? null,
      });
    }
    setCalendarScrollY(sv);
  }, []);
  // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
  // bug fix): mirror the same accessor pattern for `scrollX` (FlashList
  // horizontal scroll) and the zoom-pan transform SVs so the arrow
  // overlay can stay glued to the body content even when the user
  // scrolls horizontally between tech columns OR pans the canvas
  // 1-finger (which writes `zoomTX`/`zoomTY`). See
  // `MoveChainArrowOverlay`'s combined `useAnimatedStyle` worklet.
  const [calendarScrollX, setCalendarScrollX] = useState<SharedValue<number> | null>(null);
  const onScrollXRef = useCallback((sv: SharedValue<number>) => {
    setCalendarScrollX(sv);
  }, []);
  const [calendarZoomTX, setCalendarZoomTX] = useState<SharedValue<number> | null>(null);
  const [calendarZoomTY, setCalendarZoomTY] = useState<SharedValue<number> | null>(null);
  const onContentTransformRef = useCallback(
    (transform: { zoomTX: SharedValue<number>; zoomTY: SharedValue<number> }) => {
      setCalendarZoomTX(transform.zoomTX);
      setCalendarZoomTY(transform.zoomTY);
    },
    [],
  );
  const onTouchStart = useCallback(() => {
    if (VERBOSE_CALENDAR_LOGS) console.log("[MoveChain:Touch:Day] start");
  }, []);
  const onTouchEnd = useCallback(() => {
    if (VERBOSE_CALENDAR_LOGS) console.log("[MoveChain:Touch:Day] end");
  }, []);
  // FORK Phase 26 (2026-05-10) — per-mount bounds registry. The
  // vendored library now fires `onEventLayout` for each EventBlock
  // on every layout pass; we capture those rects so
  // `computeMoveChainArrows` can anchor arrows to actual card
  // edges instead of inferred grid cells. See
  // `useEventBoundsRegistry` and README-FORK Phase 26.
  const eventBoundsRegistry = useEventBoundsRegistry();
  // View-level scroll logger (PR-UX-2 logs pass). Fires unconditionally
  // whenever the calendar's internal scrollY changes — does not depend
  // on the overlay being mounted, so we get scroll diagnostics even
  // when no chain is selected.
  useMoveChainScrollLogger(calendarScrollY, "Day");
  const arrowSegments = useMemo(() => {
    if (calendarFrame.w <= 0) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log("[MoveChain:Wire:Day] skip — no calendar frame yet", {
          calendarFrame,
        });
      }
      return [];
    }
    // 2026-05-13 — see workweek-view's matching block. Future-mode
    // canvas paints appointments at their post-intent destinations,
    // so arrow source = destination → degenerate / wrong-direction
    // arrows. Skip the geometry pass entirely; the chip row + dot
    // row stay mounted (per 2026-05-11-toggle-stays-in-chip-row) so
    // the toggle remains accessible.
    if (futureMode) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log(
          "[MoveChain:Wire:Day] skip — futureMode (canvas shows projected world)",
        );
      }
      return [];
    }
    // 2026-05-13 — registry settling gate. See workweek-view's
    // matching block + `useEventBoundsRegistry.invalidate`
    // doc-block for the rationale.
    if (!eventBoundsRegistry.isSettled) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log("[MoveChain:Wire:Day] skip — registry not settled");
      }
      return [];
    }
    if (selectedChainId == null) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log(
          "[MoveChain:Wire:Day] skip — no chain selected (Show all baseline)",
        );
      }
      return [];
    }
    if (moveChainGraph.chains.length === 0) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log("[MoveChain:Wire:Day] skip — graph has 0 chains");
      }
      return [];
    }
    if (visibleResourceIds.length === 0) {
      if (VERBOSE_CALENDAR_LOGS) {
        console.log("[MoveChain:Wire:Day] skip — no visible resources");
      }
      return [];
    }
    const TIME_LABEL_WIDTH = 50;
    const visibleCols = numberOfColumns ?? visibleResourceIds.length;
    const safeCols = Math.max(1, visibleCols);
    const appointmentBlockWidth =
      (calendarFrame.w - TIME_LABEL_WIDTH) / safeCols;
    const segs = computeMoveChainArrows(
      moveChainGraph,
      localIntents,
      linterAppointments,
      selectedChainId,
      {
        viewType: "day",
        hourHeight,
        minuteOffset: startMinutes,
        appointmentBlockWidth,
        timeLabelWidth: TIME_LABEL_WIDTH,
        selectedDate,
        resources: visibleResourceIds,
        // FORK Phase 26 (2026-05-10): hand the registry's `get`
        // accessor to the geometry helper so it can use rendered
        // bounds when available.
        eventBoundsLookup: eventBoundsRegistry.get,
        // 2026-05-12 — `fix/move-chain-arrow-registry-precision`.
        // Production gate: emit segments ONLY when both endpoints
        // come from the registry. Pairs with `eventBoundsRegistry.
        // tick` in the deps below to re-derive when the registry
        // settles. See compute helper doc-block.
        requireRegistryRect: true,
      },
      chainStepHighlights,
    );
    if (VERBOSE_CALENDAR_LOGS) {
      console.log("[MoveChain:Wire:Day] computed", {
        selectedChainId,
        chainCount: moveChainGraph.chains.length,
        segmentCount: segs.length,
        calendarFrame,
        appointmentBlockWidth,
        hourHeight,
        startMinutes,
        selectedDate,
        visibleResourceIds,
      });
    }
    return segs;
  }, [
    calendarFrame.w,
    chainStepHighlights,
    futureMode,
    hourHeight,
    linterAppointments,
    localIntents,
    moveChainGraph,
    numberOfColumns,
    selectedChainId,
    selectedDate,
    startMinutes,
    visibleResourceIds,
    // FORK Phase 26: registry accessor identity is stable across
    // renders (the hook memoizes), so this dep is effectively
    // immutable but kept in the array for completeness.
    eventBoundsRegistry.get,
    // 2026-05-12 — settling-tick signal. Bumps ~50ms after the
    // last `onEventLayout` cluster ends, triggering this useMemo
    // to re-derive with a populated registry. Required for the
    // `requireRegistryRect: true` gate above to ever transition
    // from "all skipped" to "all emitted." See
    // `useEventBoundsRegistry` for the contract.
    eventBoundsRegistry.tick,
    // 2026-05-13 — settling gate. See workweek-view's matching
    // dep + the early return above for the contract.
    eventBoundsRegistry.isSettled,
  ]);

  // 2026-05-13 — see workweek-view's matching block. Invalidate the
  // bounds registry whenever futureMode flips so stale rects from
  // the prior projection are flagged stale until the post-toggle
  // layout cluster re-bumps `tick`. We deliberately do NOT wipe
  // the map (entries for events whose position is unchanged across
  // the projection swap retain their still-correct rects — the
  // vendored library never re-fires `onEventLayout` for those).
  // See `useEventBoundsRegistry.invalidate` doc-block.
  const registryInvalidate = eventBoundsRegistry.invalidate;
  useEffect(() => {
    registryInvalidate();
  }, [futureMode, registryInvalidate]);

  const eventStyleOverrides = useCallback(
    (event: RCEvent): StyleOverrides | undefined => {
      // Palette shift 2026-04-21: real cards become saturated solid
      // per-tech colors (matches landscape overlay mode). The pale
      // SLOT_TYPE_COLORS treatment shifts to drafts where it now
      // reads as a soft "in-progress" placeholder against the bold
      // solid cards. Personal events keep their neutral grey.
      let base: StyleOverrides | undefined;
      if (isDraftEvent(event)) {
        const colors = SLOT_TYPE_COLORS.standard;
        base = {
          container: {
            backgroundColor: colors.bg,
            borderLeftWidth: 3,
            borderLeftColor: colors.border,
          },
          title: { color: colors.text, fontWeight: "700" },
          desc: { color: colors.text, opacity: 0.8 },
          time: { color: colors.text },
        };
      } else if (isPersonalEvent(event)) {
        base = {
          container: {
            backgroundColor: "#F3F4F6",
            borderLeftWidth: 3,
            borderLeftColor: "#9CA3AF",
          },
          title: { color: "#4B5563" },
          desc: { color: "#6B7280" },
        };
      } else {
        const techColor = colorForTech(event.resourceId);
        const textColor = readableTextOn(techColor);
        base = {
          container: {
            backgroundColor: techColor,
            borderWidth: 1,
            borderColor: techColor,
          },
          title: { color: textColor, fontWeight: "700" },
          desc: { color: textColor, opacity: 0.9 },
          time: { color: textColor },
        };
      }
      const withPending = applyPendingChangeBorderOverride(event, base, {
        localIntents,
        localSessionId,
        knownSessionIds,
      });
      return applyMoveChainBorderOverride(event, withPending, {
        graph: moveChainGraph,
        selectedChainId,
        localIntents,
        visibleDestSlots,
        chainStepHighlights,
        auxHighlightedChainIds,
      });
    },
    [
      auxHighlightedChainIds,
      chainStepHighlights,
      knownSessionIds,
      localIntents,
      localSessionId,
      moveChainGraph,
      selectedChainId,
      visibleDestSlots,
    ],
  );

  // PR-UX-2 PASS 2.3 (move-chain tile pulse, 2026-05-05): per-event
  // animated-opacity descriptor handed to the vendored EventBlock via
  // FORK Phase 25's `getEventOpacity` prop. Reads the singleton pulse
  // SV from `move-chain-pulse-singleton.ts`; the resolver returns
  // `null` for any tile that should NOT pulse (Show all baseline,
  // tiles outside the selected chain, etc.) so the worklet collapses
  // to opacity:1 on the UI thread without a re-render.
  const getEventOpacity = useCallback(
    (event: RCEvent) =>
      resolveMoveChainPulse(event, {
        graph: moveChainGraph,
        selectedChainId,
        localIntents,
        chainStepHighlights,
      }),
    [chainStepHighlights, moveChainGraph, selectedChainId, localIntents],
  );

  return (
    <View style={styles.container}>
      {chainGraphReady && moveChainGraph.chains.length > 0 ? (
        <MoveChainChipRow
          graph={moveChainGraph}
          selectedChainId={selectedChainId}
          onSelect={setSelectedChainId}
          bottomSlot={chipRowBottomSlot}
        />
      ) : null}
      {/* PR-UI-REDESIGN-2 (2026-05-12): Day-view bottom chrome row —
        * `[< MMM D, YYYY >]   [Week View →]`. The chevrons + label
        * are `<CalendarDateNavRow>` (no map/density icons here —
        * those moved into the compressed `<CalendarHeader>` mode
        * row at the top of the screen). The forward link is the
        * same `<WorkweekBackBar>` component used in the Week view,
        * just with `direction="forward"` and a "Week View" label.
        * Tapping it flips `useCalendarStore.viewMode` to "week". */}
      <View style={styles.bottomChromeRow}>
        <View style={styles.bottomChromeRowCenter}>
          <CalendarDateNavRow />
        </View>
        <WorkweekBackBar
          direction="forward"
          label="Week View"
          onPress={() => useCalendarStore.getState().setViewMode("week")}
        />
      </View>
      <View
        ref={calendarWrapperRef}
        style={styles.calendarWrapper}
        onLayout={onCalendarLayout}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Calendar
          mode="day"
          date={dateObj}
          resources={resources}
          numberOfColumns={numberOfColumns}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          hourHeight={hourHeight}
          onZoom={onZoom}
          snapIntervalInMinutes={5}
          onEventPress={onEventPress}
          onEventLongPress={onEventLongPress}
          onResourcePress={onResourcePress}
          onResourceDoublePress={onResourceDoublePress}
          onResourceReorder={onResourceReorder}
          selectedResourceIds={selectedTechIds}
          onBlockTap={onBlockTap}
          onBlockLongPress={onBlockLongPress}
          enableHapticFeedback
          eventStyleOverrides={eventStyleOverrides}
          getEventOpacity={getEventOpacity}
          eventSlots={EVENT_SLOTS}
          overLappingLayoutMode="stacked"
          onScrollYRef={onScrollYRef}
          // FORK Phase 26 (2026-05-10 — move-chain arrow alignment):
          // capture each EventBlock's post-style rendered rect into
          // a per-mount registry. The arrow geometry helper reads
          // from this registry to anchor arrow endpoints flush
          // against visible card edges instead of inferred grid
          // cells. See `useEventBoundsRegistry` and README-FORK
          // Phase 26.
          onEventLayout={eventBoundsRegistry.record}
          // FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up,
          // 2026-05-06): tag every `[CAL:*]` log line from this
          // calendar with `DAY-PORTRAIT` so smoke logs are
          // self-attributing across the three Calendar mounts in
          // the franchise app. See README-FORK Phase 28.2-logging.
          calendarId="DAY-PORTRAIT"
          onScrollXRef={onScrollXRef}
          onContentTransformRef={onContentTransformRef}
        />
        {arrowSegments.length > 0 ? (
          <MoveChainArrowOverlay
            segments={arrowSegments}
            width={calendarFrame.w}
            height={calendarFrame.h}
            // Day view shows the resource avatar header AND a date
            // strip; both contribute to the body-top offset.
            bodyTopOffset={DAY_BODY_TOP_OFFSET}
            active={selectedChainId != null}
            scrollYRef={calendarScrollY ?? undefined}
            scrollXRef={calendarScrollX ?? undefined}
            zoomTXRef={calendarZoomTX ?? undefined}
            zoomTYRef={calendarZoomTY ?? undefined}
          />
        ) : null}
      </View>
    </View>
  );
}

// Approximate height of the day-view header (resource avatar strip
// + date strip). Tunable from observed device behavior; revisit if
// the resource header height changes.
const DAY_BODY_TOP_OFFSET = 80;

export function useDraggedEventDraftSubscription(
  onDragEnd: ((draft: DraggedEventDraft) => void) | undefined,
) {
  const { useGetDraggedEventDraft, useSetDraggedEventDraft, useSetSelectedEvent, useGetSelectedEvent } = useCalendarBinding();
  const draft = useGetDraggedEventDraft();
  const setDraft = useSetDraggedEventDraft();
  const selectedEvent = useGetSelectedEvent();
  const setSelectedEvent = useSetSelectedEvent();
  // PR-UX-11 (2026-05-09): mutate refs in `useEffect`, NOT during
  // render, to avoid Reanimated 4's worklet-freeze warning
  // ("[Worklets] Tried to modify key `current` of an object which
  // has been already passed to a worklet."). The `useCalendarBinding`
  // context exposes shared values that Reanimated walks the closure
  // of when registering effect subscribers. Render-time `.current =`
  // assignment freezes the ref AFTER Reanimated captures it; the
  // next render's mutation tripped the freeze guard and printed a
  // warning per render.
  //
  // Same pattern as `landscape/use-drag-to-avatar.ts`'s
  // `setSelectedTechIdsRef` (proven warning-free reference).
  // Anti-instructions:
  //   - Don't move these mutations back into render. The next
  //     worklet serialization pass (drag init, orientation pip,
  //     calendar remount) will re-print the warning.
  //   - Don't fold these into `useEffect`'s body inside the
  //     `if (!draft) return` block — that effect re-fires on
  //     `draft` changes only; we need the ref refresh to happen on
  //     the `onDragEnd` prop changing.
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);
  const hasCallbackRef = useRef(!!onDragEnd);
  useEffect(() => {
    hasCallbackRef.current = !!onDragEnd;
  }, [onDragEnd]);

  useEffect(() => {
    if (!draft) return;
    console.log("[CAL:dragSub] draft detected", {
      eventId: draft.event?.id,
      from: draft.from,
      to: draft.to,
      date: draft.date,
      resourceId: draft.resourceId,
      hasCallback: hasCallbackRef.current,
      hasSelectedEvent: !!selectedEvent,
    });
    setDraft(null);
    setSelectedEvent(null);
    console.log("[CAL:dragSub] cleared draft+selectedEvent, calling handler");
    try {
      onDragEndRef.current?.(draft);
      console.log("[CAL:dragSub] handler returned OK");
    } catch (err) {
      console.error("[CAL:dragSub] handler threw", err);
    }
  }, [draft, setDraft, setSelectedEvent, selectedEvent]);

  return draft;
}

// Stable `eventSlots` reference so the library's memoization
// (`React.memo` + the `useMemo` for `effectiveRenderer` over
// `[eventSlots, eventStyleOverrides]`) doesn't churn every render.
const EVENT_SLOTS = { TopRight: PendingChangeBadge } as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  calendarWrapper: { flex: 1, position: "relative" },
  // PR-UI-REDESIGN-2 (2026-05-12): Day-view bottom-chrome row.
  // `<CalendarDateNavRow>` already has its own paddingHorizontal /
  // background; the wrapper just establishes the flex-row layout
  // with the trailing forward-link to Week view.
  bottomChromeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 2,
    gap: 8,
  },
  bottomChromeRowCenter: {
    flex: 1,
  },
});
