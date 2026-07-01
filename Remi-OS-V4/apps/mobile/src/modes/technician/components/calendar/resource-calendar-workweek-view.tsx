import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
} from "react-native";
import { useDragToAvatar } from "@technician/components/calendar/landscape/use-drag-to-avatar";
import { useAvatarStripBboxDerivation } from "@technician/components/calendar/use-avatar-strip-bbox-derivation";
import { useCollapseProgress } from "@technician/components/calendar/CollapsibleTopContext";
import { useDraggedEventDraftSubscription } from "@technician/components/calendar/resource-calendar-day-view";
import {
  Calendar,
  type Event as RCEvent,
  type Resource,
  type DraggedEventDraft,
} from "react-native-resource-calendar";
import type { SharedValue } from "react-native-reanimated";
import { useMoveChainScrollLogger } from "@technician/components/calendar/use-move-chain-scroll-logger";
import {
  useClearSelectionOnUnmount,
  useClearSelectionOnTechChange,
} from "./resource-calendar-day-view";
import {
  mapWeekResponseForTech,
  getEventColor,
  isPersonalEvent,
  isDraftEvent,
  computeEffectiveDisplayRange,
  padRangeToFillViewport,
} from "@technician/utils/resource-calendar-mapping";
import { useResourcesWithDraft } from "@technician/components/calendar/FloatingDraftCard";
import { useResourcesWithMoveChainGhosts } from "@technician/components/calendar/move-chain-ghost-tiles";
import { SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import { colorForTech } from "@technician/utils/color-for-tech";
import type { CalendarDayResponse } from "@technician/types/calendar";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { StyleOverrides } from "react-native-resource-calendar";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { applyPendingChangeBorderOverride } from "@technician/components/calendar/pending-change-overlay-style";
import { useKnownReorganizationSessionIds } from "@technician/hooks/calendar/use-known-reorganization-session-ids";
import { applyMoveChainBorderOverride } from "@technician/components/calendar/move-chain-overlay-style";
import { resolveMoveChainPulse } from "@technician/components/calendar/move-chain-pulse-resolver";
import { useMoveChainPulse } from "@technician/components/calendar/use-move-chain-pulse";
import { MoveChainChipRow } from "@technician/components/calendar/MoveChainChipRow";
import { MoveChainArrowOverlay } from "@technician/components/calendar/MoveChainArrowOverlay";
import { TechNameFlashOverlay } from "@technician/components/calendar/TechNameFlashOverlay";
import { useSideArrowTechMount } from "@technician/components/calendar/use-side-arrow-tech-mount";
import { computeMoveChainArrows } from "@technician/components/calendar/compute-move-chain-arrows";
import { useEventBoundsRegistry } from "@technician/hooks/calendar/use-event-bounds-registry";
import {
  WorkweekAvatarStrip,
  type WorkweekTechOption,
} from "@technician/components/calendar/WorkweekAvatarStrip";
import { WorkweekBackBar } from "@technician/components/calendar/WorkweekBackBar";
import { WorkweekDateNav } from "@technician/components/calendar/WorkweekDateNav";
import {
  getVisibleMoveChainDestSlots,
} from "@technician/utils/detect-move-chains";
import { useMoveChainGraph } from "@technician/components/calendar/use-move-chain-graph";
import { useAutoIsolateOnStage } from "@technician/components/calendar/use-auto-isolate-on-stage";
import { PendingChangeBadge } from "@technician/components/calendar/PendingChangeBadge";
import dayjs from "dayjs";

// Re-export the strip's tech-option type so existing call sites that
// imported `WorkweekTechOption` from this file (the pre-modularization
// home) keep compiling without source-side renames.
export type { WorkweekTechOption };

// PR-UX-5 (2026-05-08) — stable empty-intents reference; see
// resource-calendar-day-view.tsx for the rationale.
const EMPTY_INTENTS: ReorganizationIntent[] = [];

// Pick black or white text for legibility on a saturated tech color.
// Inlined alongside the day-view copy; extract to a shared util once
// a third site needs it.
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

const WORKWEEK_DAYS = 4;

interface Props {
  weekData: CalendarDayResponse[] | undefined;
  techId: number;
  techName: string;
  workweekStartDate: string;
  hourHeight: number;
  /**
   * Measured pixel height of the calendar's parent viewport. Used to
   * pad the visible time range so the grid always fills to the bottom
   * of its container (added 2026-04-22, P2-FE-5 chunk 2c follow-up).
   * Pass 0 / undefined to disable the fill behavior.
   */
  viewportHeight?: number;
  onZoom?: (newHeight: number) => void;
  onEventPress?: (event: RCEvent) => void;
  onEventLongPress?: (event: RCEvent) => void;
  onBlockLongPress?: (resource: Resource, date: Date) => void;
  /**
   * P2-FE-5 (course-corrected 2026-04-21): tap-to-create draft. Fired
   * when the user taps an empty cell. Receives the resource (tech) and
   * the cell's date+time-of-day. Consumer is expected to call
   * `useCalendarStore.createDraft(...)` to inject the dashed draft
   * block. See FloatingDraftCard.tsx for the full lifecycle.
   */
  onBlockTap?: (resource: Resource, date: Date) => void;
  onBackPress: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /**
   * Optional. List of available technicians (already sorted in the parent's
   * preferred order, e.g. `techOrder`). When provided, the workweek view
   * renders a horizontal strip of small dimmed avatars below the title row
   * so the user can switch which tech the workweek is showing without
   * exiting back to Day view first. The current `techId` chip is rendered
   * highlighted; tapping any other chip calls `onSwitchTech`.
   */
  availableTechs?: WorkweekTechOption[];
  onSwitchTech?: (techId: number, techName: string) => void;
  /**
   * Drag-end subscription. The workweek view mounts its own
   * `useDraggedEventDraftSubscription` (mirroring the landscape
   * view) so the parent must NOT mount a parallel
   * `<RCDragSubscription>` for the workweek branch — two
   * subscriptions race the `setDraft(null)` consumption and the
   * second one always sees a null draft.
   *
   * PLAN-DEVIATION: 2026-05-08-portrait-week-hover-dwell-parity —
   * the avatar hover-dwell pattern auto-swaps `workweekTechId`
   * during the drag (via `onSwitchTech`), so by the time this
   * handler fires the calendar is already showing the destination
   * tech. The drop produces a single `reschedule` intent against
   * the new tech (no separate reassign branch). See
   * docs/PLAN-DEVIATIONS.md#2026-05-08-portrait-week-hover-dwell-parity.
   */
  onDragEnd?: (draft: DraggedEventDraft) => void;
  /**
   * 2026-05-10 user fix: optional render slot stacked beneath the
   * dot row INSIDE the `<MoveChainChipRow>`. Forwarded verbatim to
   * `MoveChainChipRow.bottomSlot`. The franchise mount in
   * `app/(tabs)/index.tsx` passes `<NowFutureToggle />` here so the
   * toggle nests inside the chip row's white pill — replaces the
   * sibling-above-the-canvas placement that left an unused white
   * band the user couldn't eliminate via padding alone. Tech-side
   * mounts leave this `undefined` and the chip row renders without
   * the slot.
   */
  chipRowBottomSlot?: ReactNode;
}

export function ResourceCalendarWorkweekView({
  weekData,
  techId,
  techName,
  workweekStartDate,
  hourHeight,
  viewportHeight,
  onZoom,
  onEventPress,
  onEventLongPress,
  onBlockLongPress,
  onBlockTap,
  onBackPress,
  onPrevWeek,
  onNextWeek,
  availableTechs,
  onSwitchTech,
  onDragEnd,
  chipRowBottomSlot,
}: Props) {
  useClearSelectionOnUnmount();
  // PR-UX-8 (2026-05-09): clear `selectedEvent` + `draggedEventDraft`
  // whenever the user switches which tech the workweek is showing.
  // Without this, a held-but-not-dragged card from tech A "follows"
  // the user when they tap tech B's avatar to browse, and the next
  // pan finalizes a drop on B. See the hook's doc-block in
  // `resource-calendar-day-view.tsx` for the user-repro narrative.
  useClearSelectionOnTechChange(techId);

  const baseResources = useMemo(() => {
    if (!weekData) return [];
    const mapped = mapWeekResponseForTech(weekData, techId);
    console.log("[CAL:weekView] mapped", { techId, daysIn: weekData.length, eventCount: mapped[0]?.events.length ?? 0 });
    return mapped;
  }, [weekData, techId]);

  // P2-FE-5 (course-corrected 2026-04-21): inject the in-flight
  // pending draft as a synthetic event. No-op when no draft.
  const resourcesWithDraft = useResourcesWithDraft(baseResources);

  const dateObj = useMemo(
    () => new Date(workweekStartDate + "T00:00:00"),
    [workweekStartDate],
  );

  const weekLabel = useMemo(() => {
    const start = dayjs(workweekStartDate);
    const end = start.add(WORKWEEK_DAYS - 1, "day");
    return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
  }, [workweekStartDate]);

  // User's persisted default visible-range bounds (set in Settings).
  const defaultStart = useCalendarStore((s) => s.displayStartMinutes);
  const defaultEnd = useCalendarStore((s) => s.displayEndMinutes);
  const autoExpand = useCalendarStore((s) => s.displayAutoExpand);

  // Effective range. When "Fit to events" is ON (default), the visible
  // window is the actual span of all events across the visible workweek
  // snapped to 30-minute boundaries (falling back to the user's
  // defaults if the whole week is empty). When OFF, the user's chosen
  // bounds are strict and out-of-range events get clipped at the edges
  // of the grid. Recomputed when weekData changes, so the view reshapes
  // itself automatically (fit mode only).
  const { startMinutes, endMinutes } = useMemo(() => {
    const base = autoExpand
      ? computeEffectiveDisplayRange(weekData, defaultStart, defaultEnd)
      : { startMinutes: defaultStart, endMinutes: defaultEnd };
    // 2026-04-22 fill-to-bottom: see resource-calendar-day-view for
    // rationale. Workweek view also needs to fill the viewport
    // because the same fitted-range issue applies across 4 days.
    return padRangeToFillViewport(
      base.startMinutes,
      base.endMinutes,
      viewportHeight ?? 0,
      hourHeight,
    );
  }, [weekData, defaultStart, defaultEnd, autoExpand, viewportHeight, hourHeight]);

  // P3-FE-8 (C.12): see day-view comment for rationale.
  const localIntentsRaw = usePendingRealityStore((s) => s.intents);
  const localSessionId = usePendingRealityStore((s) => s.sessionId);
  // PLAN-DEVIATION: 2026-05-11-toggle-stays-in-chip-row — see
  // docs/PLAN-DEVIATIONS.md#2026-05-11-toggle-stays-in-chip-row and
  // the matching block in `resource-calendar-day-view.tsx` for the
  // full rationale. Short version: PR-UX-5's `EMPTY_INTENTS`
  // short-circuit collapsed the chain graph in Future mode, which
  // unmounted the chip row + the toggle inside it. User 2026-05-11
  // wants the chip row + toggle to stay visible in Future mode;
  // use `localIntentsRaw` directly.
  const futureMode = useCalendarStore((s) => s.futureMode);
  const localIntents = localIntentsRaw;
  // PR-UX-2 PASS 2.18 (2026-05-05): orphan-session suppression set —
  // see day-view's comment for the full rationale.
  const knownSessionIds = useKnownReorganizationSessionIds();
  const selectedChainId = usePendingRealityStore((s) => s.selectedChainId);
  const setSelectedChainId = usePendingRealityStore((s) => s.setSelectedChainId);
  // PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set. Threaded
  // through the ghost hook, arrow compute, border override, and
  // pulse resolver so a chip-row dot tap narrows ghosts/arrows/
  // pulses to the lit subset of intents in the selected chain.
  const chainStepHighlights = usePendingRealityStore(
    (s) => s.chainStepHighlights,
  );
  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — aux highlight
  // set for the chain-to-chain conflict toast.
  const auxHighlightedChainIds = usePendingRealityStore(
    (s) => s.auxHighlightedChainIds,
  );

  // PR-UX-2 PASS 2.3.1 (2026-05-05): host the pulse-singleton
  // subscription at the view level so it's gated on "is a chain
  // selected?" rather than "did the arrow overlay decide to render
  // any arrows?". See MoveChainArrowOverlay's doc-block for the
  // failure mode this fixes.
  useMoveChainPulse(selectedChainId !== null, "view:workweek");

  // Move-chain selector PASS 1 — derive the chain graph from the
  // 4-day workweek window. Routed through `useMoveChainGraph` so this
  // mount, the day view, the landscape workweek view, AND the Pending
  // Reality review screen's per-card "Chain N" badge all source from
  // the SAME seam — see the hook's doc-block for the divergence this
  // collapses. Empty intents → empty graph (overlay short-circuits).
  const { graph: moveChainGraph, linterAppointments } = useMoveChainGraph(
    localIntents,
    weekData,
  );

  // 2026-05-08 follow-up #4 (PR-UX-3 bug #2): auto-isolate the
  // just-staged chain. See `use-auto-isolate-on-stage.ts` doc-block
  // for the full rationale; this is the workweek-view mount of the
  // same hook. Mirrors the day-view's wiring exactly — only
  // difference is the `intents` / `graph` / `selectedChainId` are
  // sourced from this view's local subscriptions (same store, same
  // values; just less plumbing if the hook is in the same scope).
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

  // PR-UX-3 (2026-05-07): wire the side-arrow widget on the active
  // chain chip + the cross-tech flash overlay. The hook reads
  // `selectedChainId` + `chainStepHighlights` from the store, derives
  // the active step's source-tech, and on change calls
  // `enterWorkweek` to remount + bumps `flashKey` so the sibling
  // `TechNameFlashOverlay` re-runs its 200/200/200 envelope.
  // Single-tech chains never trip the source-tech change branch
  // (every step's source equals the seed = currently-mounted tech),
  // so PR-UX-2 single-tech regression stays intact.
  const techNamesById = useMemo(() => {
    const m = new Map<number, string>();
    if (availableTechs) {
      for (const t of availableTechs) m.set(t.id, t.name);
    }
    // Always include the currently-mounted tech (covers callers that
    // don't pass `availableTechs`, e.g. single-tech franchises).
    m.set(techId, techName);
    return m;
  }, [availableTechs, techId, techName]);
  const sideArrow = useSideArrowTechMount({
    graph: moveChainGraph,
    intents: localIntents,
    appointments: linterAppointments,
    techNamesById,
  });

  // Portrait-week hover-dwell wiring — landscape parity per
  // 2026-04-22-hover-dwell-avatar-navigator.
  //
  // PLAN-DEVIATION: 2026-05-08-portrait-week-hover-dwell-parity —
  // supersedes 2026-05-07-portrait-drop-on-avatar. The avatar is no
  // longer a drop target; it's a hover-dwell calendar switcher,
  // exactly like landscape. The one mode-aware difference is the
  // dwell callback: landscape calls `setSelectedTechIds([X])` to
  // narrow the visible-tech set; portrait shows ONE tech at a time
  // so the equivalent action is `enterWorkweek(X)` which swaps
  // `workweekTechId`. We adapt by feeding the dwell hook a
  // `selectedTechIds`-shaped view of the single mounted tech and a
  // `setSelectedTechIds` adapter that proxies back to the parent's
  // `onSwitchTech(id, name)` callback (which itself is wired to
  // `enterWorkweek(id, name)` in `app/(tabs)/index.tsx`). Drop
  // produces a single `reschedule` intent with the destination
  // tech baked in (no separate reassign branch). See
  // docs/PLAN-DEVIATIONS.md#2026-05-08-portrait-week-hover-dwell-parity.
  const dwellSelectedTechIds = useMemo(() => [techId], [techId]);
  // PR-UX-11 (2026-05-09): mutate refs in `useEffect`, NOT during
  // render, to avoid Reanimated 4's worklet-freeze warning. The
  // dwell hook (`useDragToAvatar`) registers `useAnimatedReaction`
  // worklets that walk the `setSelectedTechIds` closure; render-time
  // ref mutation here would trip the freeze guard. Same pattern as
  // `useDraggedEventDraftSubscription` in resource-calendar-day-view.tsx
  // and `setSelectedTechIdsRef` in `landscape/use-drag-to-avatar.ts`
  // (proven warning-free reference). See the PR-UX-11 dev-log entry
  // for the full diagnosis.
  const availableTechsRef = useRef(availableTechs);
  useEffect(() => {
    availableTechsRef.current = availableTechs;
  }, [availableTechs]);
  const onSwitchTechRef = useRef(onSwitchTech);
  useEffect(() => {
    onSwitchTechRef.current = onSwitchTech;
  }, [onSwitchTech]);
  // The dwell hook signature takes `(ids: number[]) => void`. The
  // hook only ever calls it with a single-element array (the
  // hovered tech) at buzz 2, and with the prior selection at
  // revert. Both shapes contain a single tech id (because we
  // started from `[techId]`), so we always read `ids[0]` and
  // proxy to `onSwitchTech` — which the parent has wired to
  // `enterWorkweek`. Stable callback identity via refs so the
  // dwell hook's timer callbacks always see the latest props
  // without re-mounting the hook on every render.
  const dwellSetSelectedTechIds = useCallback((ids: number[]) => {
    if (ids.length !== 1) return;
    const target = ids[0];
    const onSwitch = onSwitchTechRef.current;
    if (!onSwitch) return;
    const techs = availableTechsRef.current;
    const found = techs?.find((t) => t.id === target);
    onSwitch(target, found?.name ?? "");
  }, []);
  const { registerAvatarBbox } = useDragToAvatar({
    selectedTechIds: dwellSelectedTechIds,
    setSelectedTechIds: dwellSetSelectedTechIds,
  });

  // PLAN-DEVIATION: 2026-05-08-avatar-strip-bbox-derivation —
  // strip-level bbox derivation replaces the per-tile
  // `measureInWindow` pattern shipped in
  // `2026-05-08-portrait-week-hover-dwell-parity`. The hook captures
  // the strip's window position once per ancestor reflow (via the
  // strip's own `onLayout` + a Reanimated reaction on the
  // `<CollapsibleTop>` collapse-progress SV + a `remeasureKey`
  // safety net) and derives each tile's window bbox from
  // `stripBbox + tileRelativeOffset`. Per-tile relative offsets are
  // captured (one-shot on chip mount) via the hook's `onTileLayout`.
  // See docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
  //
  // The ref attaches to the outer `<ScrollView>`. RN's `ScrollView`
  // forwards `measureInWindow` through to its underlying View, so
  // the hook's `node.measureInWindow(...)` call works the same as
  // it would on a plain View. We type the ref as `View` (the
  // hook's accepted shape) and cast on assignment to satisfy
  // RN's stricter `RefObject<ScrollView>` typing.
  const portraitStripRef = useRef<ScrollView>(null);
  const collapseProgressSV = useCollapseProgress();
  // The safety-net `remeasureKey` is bumped whenever sibling chrome
  // that COULD shift the strip's window y might mount/unmount:
  //   - `localIntentsRaw.length > 0` (= `hasStagedIntents`) gates
  //     `<NowFutureToggle>` ABOVE the workweek view in app/(tabs)/
  //     index.tsx → state 3.
  //   - `moveChainGraph.chains.length` gates `<MoveChainChipRow>`
  //     BELOW the strip in JSX order; the chip row alone shouldn't
  //     shift the strip in window coords (siblings AFTER the strip
  //     don't move it), but bumping on this dep is cheap and
  //     defensive against future layout changes that might invert
  //     the relationship.
  //   - `futureMode` doesn't currently change any chrome height
  //     directly, but it gates the `EMPTY_INTENTS` short-circuit
  //     and is bundled with the toggle's UX state. Including it
  //     keeps the dep set aligned with the diagnosis (PR-UX-6
  //     prompt) without an additional state-tracking ref.
  // We use `localIntentsRaw` (the un-Future-suppressed source) for
  // the dep so we react to actual session presence, not to the
  // gated empty-set.
  const stripRemeasureKey = useMemo(
    () =>
      `${localIntentsRaw.length > 0 ? 1 : 0}-${moveChainGraph.chains.length}-${futureMode ? 1 : 0}`,
    [localIntentsRaw.length, moveChainGraph.chains.length, futureMode],
  );
  const { onStripLayout: onPortraitStripLayout, onTileLayout: onPortraitTileLayout } =
    useAvatarStripBboxDerivation({
      // ScrollView is a View at the underlying-ref level
      // (`measureInWindow` is inherited from NativeMethodsMixin).
      // The cast keeps the hook's accepted-shape typing tight without
      // forcing every caller to widen its signature.
      stripRef: portraitStripRef as unknown as RefObject<View | null>,
      registerAvatarBbox,
      remeasureKey: stripRemeasureKey,
      collapseProgressSV,
    });

  // Drag-end is now a pure pass-through to the parent's grid-drop
  // path. The dwell pattern has already swapped `workweekTechId`
  // (if any) to the destination tech BEFORE the drop fires, so the
  // parent's `handleRCDragEnd` sees the new resource id naturally.
  // Mirrors the landscape view's ownership model — the workweek
  // view OWNS the drag-end subscription so the parent must NOT
  // mount a parallel `<RCDragSubscription>` for this branch.
  useDraggedEventDraftSubscription(onDragEnd);

  // 2026-05-13 — Future-mode ghost suppression. `selectedChainId`
  // ↳ `null` whenever the canvas is showing the projected world,
  // because every staged appointment has already been moved to its
  // destination on the canvas itself — overlaying a ghost AT the
  // same destination just paints a duplicate (semi-transparent
  // ghost frame on top of the real appointment card). The chip row
  // continues to subscribe to the live `selectedChainId` (so the
  // toggle + dot row stay interactive), but every chain-destination
  // overlay (ghost tiles, arrow geometry, border-override exemption)
  // reads from this gated value instead. See doc-block on the
  // arrow-segments memo for the full Future-mode rationale.
  const effectiveSelectedChainId = futureMode ? null : selectedChainId;

  // PR-UX-2 PASS 2: inject move-chain ghost destination tiles for
  // each in-scope chain intent. No-op when `selectedChainId` is null
  // (Show all baseline) or when there are no intents at all.
  // Selection scoping (single chain vs all chains) is resolved
  // inside `getVisibleMoveChainDestSlots`.
  // PR-UX-3 (2026-05-07): pass `activeTechId = techId` so cross-tech
  // chains in workweek view render only the active tech's ghosts.
  // Single-tech chains still hit the same code path (every slot's
  // `technician_id` already equals `techId`, so the filter is a
  // no-op for them — preserves PR-UX-2 single-tech behavior). See
  // §1.A6 / §10.A6 of the PR-UX-3 plan docs.
  const resources = useResourcesWithMoveChainGhosts(
    resourcesWithDraft,
    moveChainGraph,
    localIntents,
    linterAppointments,
    effectiveSelectedChainId,
    chainStepHighlights,
    techId,
    auxHighlightedChainIds,
  );

  // Currently-rendered chain destination slots — used by the border
  // override to exempt cards sitting under an active ghost from the
  // dim treatment (canvas Decision 1 / PR-UX-2 PASS 2.6). Honors
  // the per-step spotlight so a card's dim/exempt decision matches
  // the ghosts that are actually on screen (without this, a card
  // could stay exempt because some chain destination overlaps it
  // even though that destination is currently dimmed by spotlight).
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
      moveChainGraph,
      localIntents,
      linterAppointments,
      effectiveSelectedChainId,
      chainStepHighlights,
      auxHighlightedChainIds,
    ],
  );

  // PR-UX-2 PASS 2.2: arrow overlay geometry. The 4-day visible
  // window is `workweekStartDate` + 0..3. Single tech (`techId`) is
  // pinned across all columns in workweek view.
  const daysWindow = useMemo(() => {
    const start = dayjs(workweekStartDate);
    return Array.from({ length: WORKWEEK_DAYS }, (_, i) =>
      start.add(i, "day").format("YYYY-MM-DD"),
    );
  }, [workweekStartDate]);
  const [calendarFrame, setCalendarFrame] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const calendarWrapperRef = useRef<View>(null);
  const onCalendarLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (__DEV__) {
      console.log("[MoveChain:Layout:WW] onLayout", { w, h });
      calendarWrapperRef.current?.measureInWindow((x, y, ww, hh) => {
        console.log("[MoveChain:Wrapper:Pos:WW]", { x, y, w: ww, h: hh });
      });
    }
    setCalendarFrame((prev) =>
      prev.w === w && prev.h === h ? prev : { w, h },
    );
  }, []);
  const [calendarScrollY, setCalendarScrollY] = useState<SharedValue<number> | null>(null);
  const onScrollYRef = useCallback((sv: SharedValue<number>) => {
    if (__DEV__) {
      console.log("[MoveChain:ScrollSV:WW] received", {
        hasSV: !!sv,
        initialValue: sv?.value ?? null,
      });
    }
    setCalendarScrollY(sv);
  }, []);
  // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
  // bug fix): see resource-calendar-day-view.tsx for the rationale.
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
    if (__DEV__) console.log("[MoveChain:Touch:WW] start");
  }, []);
  const onTouchEnd = useCallback(() => {
    if (__DEV__) console.log("[MoveChain:Touch:WW] end");
  }, []);
  // FORK Phase 26 (2026-05-10) — per-mount EventBlock bounds
  // registry. Anchors move-chain arrow endpoints to actual card
  // edges. See `useEventBoundsRegistry` + README-FORK Phase 26.
  const eventBoundsRegistry = useEventBoundsRegistry();
  useMoveChainScrollLogger(calendarScrollY, "WW");
  const arrowSegments = useMemo(() => {
    if (calendarFrame.w <= 0) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:WW] skip — no calendar frame yet", {
          calendarFrame,
        });
      }
      return [];
    }
    // 2026-05-13 — skip arrow rendering in Future mode. The canvas
    // is showing `applyIntentsToWorld(weekData, intents)` (every
    // appointment painted at its post-intent destination), so:
    //   - The chain detector's `linterAppointments` projection has
    //     each source appointment AT its destination position. The
    //     arrow source rect computed from that appointment lands on
    //     the destination, not the original source.
    //   - The destination ghost tile would also paint at the same
    //     destination position the appointment is now at.
    //   - Result: source ≈ destination, arrows render with zero
    //     length / wrong direction.
    // The Future-mode preview is meant to show the post-commit world
    // *as if* the chains had already settled, so the arrow + ghost
    // overlays are conceptually redundant there. Hiding them keeps
    // the toggle visible (chip row stays mounted per
    // 2026-05-11-toggle-stays-in-chip-row) without painting broken
    // geometry.
    if (futureMode) {
      if (__DEV__) {
        console.log(
          "[MoveChain:Wire:WW] skip — futureMode (canvas shows projected world)",
        );
      }
      return [];
    }
    // 2026-05-13 — registry settling gate. Pairs with the
    // `invalidate()` call below in the futureMode-toggle effect.
    // After a futureMode flip, the registry retains rects from the
    // previous projection until the next layout pass overwrites
    // the entries that changed. Skipping until `isSettled` flips
    // back to `true` prevents the geometry helper from emitting
    // arrows with stale endpoints during that transient window
    // (the wrong-direction-arrow bug user-reported on 2026-05-13).
    // Once `isSettled` is `true`, the registry has been re-bumped
    // by the post-toggle layout cluster — entries that needed to
    // change have been overwritten with current-projection rects,
    // and entries that didn't change retain their (still-correct)
    // values. See `useEventBoundsRegistry.invalidate` doc-block.
    if (!eventBoundsRegistry.isSettled) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:WW] skip — registry not settled");
      }
      return [];
    }
    if (selectedChainId == null) {
      if (__DEV__) {
        console.log(
          "[MoveChain:Wire:WW] skip — no chain selected (Show all baseline)",
        );
      }
      return [];
    }
    if (moveChainGraph.chains.length === 0) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:WW] skip — graph has 0 chains");
      }
      return [];
    }
    // APPOINTMENT_BLOCK_WIDTH formula matches the vendored library.
    const TIME_LABEL_WIDTH = 50;
    const appointmentBlockWidth =
      (calendarFrame.w - TIME_LABEL_WIDTH) / WORKWEEK_DAYS;
    const segs = computeMoveChainArrows(
      moveChainGraph,
      localIntents,
      linterAppointments,
      selectedChainId,
      {
        viewType: "workweek",
        hourHeight,
        minuteOffset: startMinutes,
        appointmentBlockWidth,
        timeLabelWidth: TIME_LABEL_WIDTH,
        daysWindow,
        resourceId: techId,
        // 2026-05-10 — portrait-week-only cross-tech off-view stubs.
        // When a chain link's source or destination is on a tech
        // OTHER than the currently-shown one, emit a synthetic
        // straight grey arrow stub off the right edge so the user
        // sees "this chain continues on another tech" instead of
        // a silent gap. Landscape and portrait DAY view do NOT need
        // this (multi-tech rendering shows the cross-tech rect
        // directly). See `MoveChainCalendarLayout.workweek.emitCrossTechStubs`
        // doc-block in compute-move-chain-arrows.ts.
        emitCrossTechStubs: true,
        // FORK Phase 26 (2026-05-10): per-mount bounds registry.
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
    if (__DEV__) {
      console.log("[MoveChain:Wire:WW] computed", {
        selectedChainId,
        chainCount: moveChainGraph.chains.length,
        segmentCount: segs.length,
        calendarFrame,
        appointmentBlockWidth,
        hourHeight,
        startMinutes,
        techId,
        daysWindow,
      });
    }
    return segs;
  }, [
    calendarFrame.w,
    chainStepHighlights,
    daysWindow,
    futureMode,
    hourHeight,
    linterAppointments,
    localIntents,
    moveChainGraph,
    selectedChainId,
    startMinutes,
    techId,
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
    // 2026-05-13 — settling gate. Flips to `false` for one render
    // cluster after every `invalidate()` (e.g. on futureMode
    // toggle) and back to `true` after the next record-cluster
    // settle re-bumps `tick` past `staleTick`. See the
    // `if (!eventBoundsRegistry.isSettled)` early-return above.
    eventBoundsRegistry.isSettled,
  ]);

  // 2026-05-13 — invalidate the bounds registry whenever futureMode
  // flips. The registry keys by appointment id; when the canvas
  // swaps wholesale (raw weekData ↔ projected weekData), the same
  // key now refers to the appointment at a DIFFERENT geometric
  // position. Without an invalidate, the next arrow-compute pass
  // uses stale rects (Future-mode destination positions when we're
  // now in Now mode, or vice-versa) and arrows render with
  // reversed endpoints.
  //
  // `invalidate()` (vs the previous `clear()` that wiped the map)
  // does NOT drop entries — it only bumps the staleness counter.
  // Flipping `isSettled` to `false` blocks arrow emission until
  // the post-toggle layout cluster bumps `tick` past `staleTick`
  // again. Crucially, entries for events whose position is
  // IDENTICAL across the two projections (e.g. unchanged
  // appointments outside any chain, or chain endpoints that
  // happen to land in the same column on the same time slot)
  // are RETAINED with their (still-correct) rects — the vendored
  // library never re-fires `onEventLayout` for those events
  // because their layout didn't change. Wiping the map dropped
  // them permanently, which is what caused the "after toggling
  // Future and back, arrows don't appear until I switch Show
  // None and back to Show All" user report on 2026-05-13.
  //
  // Depends on the `invalidate` callback identity (stable across
  // renders via `useCallback`) NOT the whole `eventBoundsRegistry`
  // handle — the handle's memo identity changes on every tick
  // bump, which would re-fire this effect once per layout cluster
  // (an infinite invalidate → settle → invalidate loop).
  const registryInvalidate = eventBoundsRegistry.invalidate;
  useEffect(() => {
    registryInvalidate();
  }, [futureMode, registryInvalidate]);

  const eventStyleOverrides = useCallback(
    (event: RCEvent): StyleOverrides | undefined => {
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

  // PR-UX-2 PASS 2.3 (move-chain tile pulse). See sibling
  // resource-calendar-day-view for the full rationale on why this is
  // a separate callback from `eventStyleOverrides` (the chain-border
  // styles are static; the opacity has to live on a SharedValue so the
  // animation runs on the UI thread).
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
      {moveChainGraph.chains.length > 0 ? (
        <MoveChainChipRow
          graph={moveChainGraph}
          selectedChainId={selectedChainId}
          onSelect={setSelectedChainId}
          onSideArrowPress={sideArrow.advance}
          canSideArrowPress={sideArrow.canAdvance}
          bottomSlot={chipRowBottomSlot}
        />
      ) : null}
      {/* PR-UI-REDESIGN-2 (2026-05-12): consolidated bottom-chrome
        * row — `[← Day View]   [< MMM D – MMM D, YYYY >]   [tech]`.
        * The three pieces used to render as three separate stacked
        * rows (`<WorkweekBackBar>` on top of `<WorkweekDateNav>`,
        * with the tech name living inside the back-bar). Inlined
        * here as a single flex row so the redesigned chrome
        * matches the mockups; the modular pieces (`<WorkweekBackBar
        * direction="back" />`, `<WorkweekDateNav />`) are reused
        * verbatim. The tech name is plain `<Text>` — no module
        * needed for a label. */}
      <View style={styles.bottomChromeRow}>
        <WorkweekBackBar
          direction="back"
          label="Day View"
          onPress={onBackPress}
        />
        <View style={styles.bottomChromeRowCenter}>
          <WorkweekDateNav
            label={weekLabel}
            onPrev={onPrevWeek}
            onNext={onNextWeek}
          />
        </View>
        <Text style={styles.bottomChromeTechName} numberOfLines={1}>
          {techName}
        </Text>
      </View>
      {/* PR-UI-REDESIGN-2 (2026-05-12): avatar strip moved from
        * above the chip row to below the consolidated bottom-chrome
        * row, per the redesign mockup. Same component, new
        * position. */}
      <WorkweekAvatarStrip
        availableTechs={availableTechs}
        currentTechId={techId}
        onSwitchTech={onSwitchTech}
        stripRef={portraitStripRef}
        onStripLayout={onPortraitStripLayout}
        onTileLayout={onPortraitTileLayout}
      />

      <View
        ref={calendarWrapperRef}
        style={styles.calendarWrapper}
        onLayout={onCalendarLayout}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Calendar
          mode="3days"
          multiDayCount={WORKWEEK_DAYS}
          date={dateObj}
          resources={resources}
          activeResourceId={techId}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          hourHeight={hourHeight}
          onZoom={onZoom}
          snapIntervalInMinutes={5}
          onEventPress={onEventPress}
          onEventLongPress={onEventLongPress}
          onBlockLongPress={onBlockLongPress}
          onBlockTap={onBlockTap}
          enableHapticFeedback
          eventStyleOverrides={eventStyleOverrides}
          getEventOpacity={getEventOpacity}
          eventSlots={EVENT_SLOTS}
          overLappingLayoutMode="stacked"
          onScrollYRef={onScrollYRef}
          // FORK Phase 26 (2026-05-10 — move-chain arrow alignment):
          // capture each EventBlock's post-style rendered rect into
          // a per-mount registry so arrow endpoints land flush
          // against visible card edges. See README-FORK Phase 26.
          onEventLayout={eventBoundsRegistry.record}
          // FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up,
          // 2026-05-06): tag every `[CAL:*]` log line from this
          // calendar with `WEEK-PORTRAIT` so smoke logs are
          // self-attributing across the three Calendar mounts in
          // the franchise app. See README-FORK Phase 28.2-logging.
          calendarId="WEEK-PORTRAIT"
          onScrollXRef={onScrollXRef}
          onContentTransformRef={onContentTransformRef}
        />
        {arrowSegments.length > 0 ? (
          <MoveChainArrowOverlay
            segments={arrowSegments}
            width={calendarFrame.w}
            height={calendarFrame.h}
            // Workweek mode hides the resource avatar header, so the
            // calendar's only top chrome is the date strip (~40pt).
            // Tunable from observed device behavior.
            bodyTopOffset={WORKWEEK_BODY_TOP_OFFSET}
            active={selectedChainId != null}
            scrollYRef={calendarScrollY ?? undefined}
            scrollXRef={calendarScrollX ?? undefined}
            zoomTXRef={calendarZoomTX ?? undefined}
            zoomTYRef={calendarZoomTY ?? undefined}
          />
        ) : null}
        {/* PR-UX-3 N3 (2026-05-07): tech-name flash banner. Mounts
            sibling to the arrow overlay so the banner sits on top of
            the calendar canvas (above the arrow strokes) when the
            user crosses tech boundaries via side-arrow / dot-tap.
            `flashKey` bumps on every cross-tech remount, replaying
            the inner `Animated.View`'s 200/200/200 envelope. */}
        <TechNameFlashOverlay
          flashKey={sideArrow.flashKey}
          techName={sideArrow.flashTechName}
        />
      </View>
    </View>
  );
}

// Approximate height of the workweek date-strip header. The vendored
// library doesn't expose this as a measured value, so we derive it
// from observed renders. If the date strip ever resizes (taller font
// for accessibility, etc.) revisit and consider a measured ref.
const WORKWEEK_BODY_TOP_OFFSET = 44;

// `PortraitAvatarStripTile` was extracted into
// `src/components/calendar/WorkweekAvatarStrip.tsx` (PR-UI-REDESIGN-1
// modularization, 2026-05-12).

// P3-FE-8 (C.12) — stable `eventSlots` ref; see day-view note.
const EVENT_SLOTS = { TopRight: PendingChangeBadge } as const;

const styles = StyleSheet.create({
  container: { flex: 1 },
  calendarWrapper: { flex: 1, position: "relative" },
  // PR-UI-REDESIGN-2 (2026-05-12): consolidated bottom-chrome row.
  // Layout: back-link (left), date-nav (center, flex:1), tech name
  // (right). The center wrapper takes the leftover space so
  // `<WorkweekDateNav>`'s internal `justifyContent: "center"` keeps
  // the chevron stepper visually centered between the two anchors.
  bottomChromeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  bottomChromeRowCenter: {
    flex: 1,
  },
  bottomChromeTechName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    maxWidth: 100,
  },
});
