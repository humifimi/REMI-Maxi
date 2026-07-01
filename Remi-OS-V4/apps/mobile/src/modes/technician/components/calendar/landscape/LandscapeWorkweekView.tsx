/**
 * LandscapeWorkweekView (P2-FE-4) — landscape variant of the
 * franchise workweek canvas.
 *
 * Per master plan §5.1.1 / §5.1.4 this view:
 *
 *   - Renders the vendored `<Calendar>` full-bleed (no portrait
 *     header chrome — the host hides the bottom tab bar + nav header
 *     on rotation; see `app/(tabs)/_layout.tsx`).
 *   - Anchors a 44pt vertical `AvatarStrip` to the user's
 *     preferred-hand edge from `useAccessibilityStore.preferredHand`.
 *   - Switches the appointment-card colouring rules based on
 *     `useCalendarStore.selectedTechIds.length`:
 *
 *         0 techs → empty grid (events suppressed; long-press creates
 *                   a draft via the existing draft pipeline).
 *         1 tech  → status palette (same as portrait day/workweek).
 *         2+ techs → solid per-tech card fills (clear ownership;
 *                    status/personal color coding is intentionally
 *                    suppressed while multiple techs are selected).
 *
 * Data model is identical to `ResourceCalendarWorkweekView`: each
 * `availableTech` becomes a `Resource` and the library's
 * `selectedResourceIds` filter handles which columns the body renders
 * for the 1-tech and 2+-tech selections. Empty-grid mode is achieved
 * by mapping every tech with an empty `events` array — this keeps the
 * grid + day headers + avatar dimming consistent so the long-press
 * gesture has a target surface.
 *
 * Orientation lifecycle is **not** managed here. Callers wire
 * `useCalendarTabOrientation` once at the screen level so the gate
 * doesn't flicker between portrait / landscape mounts of this view.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import ReanimatedAnimated from "react-native-reanimated";
import {
  useDraggableHud,
  type HudCorner,
} from "@technician/hooks/landscape/use-draggable-hud";
import { useChipBarAutoHide } from "@technician/hooks/calendar/use-chip-bar-auto-hide";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Calendar,
  type DraggedEventDraft,
  type Event as RCEvent,
  type Resource,
  type StyleOverrides,
} from "react-native-resource-calendar";
import {
  AvatarStrip,
  type AvatarStripTech,
  LANDSCAPE_AVATAR_STRIP_WIDTH,
} from "./avatar-strip";
import { MapToggleButton } from "./MapToggleButton";
import { PendingRealityHUD } from "./PendingRealityHUD";
import { NowFutureLandscapeToggle } from "./NowFutureLandscapeToggle";
import { buildLanesByTechId } from "./build-lanes-by-tech-id";
import {
  useClearSelectionOnUnmount,
  useDraggedEventDraftSubscription,
} from "../resource-calendar-day-view";
import {
  useDragToAvatar,
  type AvatarBbox,
} from "./use-drag-to-avatar";
import { SLOT_TYPE_COLORS } from "@technician/constants/calendar";
import { EdgeTab } from "@/src/components/shared/edge-tab";
import { FranchiseRouteMap } from "@technician/components/route/franchise-route-map";
import { MapPillRow, type MapPillDescriptor } from "@technician/components/calendar/landscape/MapPillRow";
import { useAccessibilityStore, type PreferredHand } from "@technician/stores/accessibility";
import {
  useCalendarStore,
  LANDSCAPE_MULTI_TECH_MODES,
  type LandscapeMultiTechMode,
} from "@technician/stores/calendar";
import type {
  CalendarDayResponse,
  CalendarTechnicianColumn,
} from "@technician/types/calendar";
import { colorForTech } from "@technician/utils/color-for-tech";
import { backendISOToLocalMinutes } from "@technician/utils/datetime";
import {
  computeEffectiveDisplayRange,
  isDraftEvent,
  isPersonalEvent,
} from "@technician/utils/resource-calendar-mapping";
import { useResourcesWithDraft } from "@technician/components/calendar/FloatingDraftCard";
import { useResourcesWithMoveChainGhosts } from "@technician/components/calendar/move-chain-ghost-tiles";
import { useAvatarBboxRegistry } from "@technician/hooks/landscape/use-avatar-bbox-registry";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import type { ReorganizationIntent } from "@technician/types/reorganization";

// PR-UX-5 (2026-05-08) — stable empty-intents reference; see
// resource-calendar-day-view.tsx for the rationale.
const EMPTY_INTENTS_LANDSCAPE: ReorganizationIntent[] = [];
import { applyPendingChangeBorderOverride } from "@technician/components/calendar/pending-change-overlay-style";
import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";
import { useKnownReorganizationSessionIds } from "@technician/hooks/calendar/use-known-reorganization-session-ids";
import { applyMoveChainBorderOverride } from "@technician/components/calendar/move-chain-overlay-style";
import { resolveMoveChainPulse } from "@technician/components/calendar/move-chain-pulse-resolver";
import { useMoveChainPulse } from "@technician/components/calendar/use-move-chain-pulse";
import {
  getVisibleMoveChainDestSlots,
} from "@technician/utils/detect-move-chains";
import { useMoveChainGraph } from "@technician/components/calendar/use-move-chain-graph";
import { useAutoIsolateOnStage } from "@technician/components/calendar/use-auto-isolate-on-stage";
import { MoveChainChipRow } from "@technician/components/calendar/MoveChainChipRow";
import { MoveChainArrowOverlay } from "@technician/components/calendar/MoveChainArrowOverlay";
import { computeMoveChainArrows } from "@technician/components/calendar/compute-move-chain-arrows";
import { useEventBoundsRegistry } from "@technician/hooks/calendar/use-event-bounds-registry";
import type { SharedValue } from "react-native-reanimated";
import { useMoveChainScrollLogger } from "@technician/components/calendar/use-move-chain-scroll-logger";
import dayjs from "dayjs";
import { PendingChangeBadge } from "@technician/components/calendar/PendingChangeBadge";

const WORKWEEK_DAYS = 4;

// P3-FE-8 (C.12) — stable `eventSlots` ref so the calendar's
// per-event renderer memoization (`useMemo` over
// `[eventSlots, eventStyleOverrides]`) doesn't churn each render.
const EVENT_SLOTS = { TopRight: PendingChangeBadge } as const;

interface ResourceWithEvents extends Resource {
  events: RCEvent[];
}

interface Props {
  /** Franchise id for route-map mode. */
  franchiseId?: number;
  /** Calendar date to feed map mode (`YYYY-MM-DD`). */
  selectedDate?: string;
  /** Week response from `useFranchiseWeekView` (4 days). */
  weekData: CalendarDayResponse[] | undefined;
  /** Monday of the workweek (YYYY-MM-DD). */
  workweekStartDate: string;
  /** Vertical pixels per hour for the calendar grid. */
  hourHeight: number;
  /** Pre-sorted technician roster (already in `techOrder` order). */
  availableTechs: AvatarStripTech[];
  onZoom?: (newHeight: number) => void;
  onEventPress?: (event: RCEvent) => void;
  onEventLongPress?: (event: RCEvent) => void;
  onBlockLongPress?: (resource: Resource, date: Date) => void;
  /**
   * P2-FE-5 (course-corrected 2026-04-21): tap-to-create draft. Fired
   * when the user taps an empty cell. Receives the resource (tech) and
   * the cell's date+time-of-day. See `FloatingDraftCard.tsx` for the
   * full lifecycle and `docs/PLAN-DEVIATIONS.md#2026-04-21-tap-to-create-draft`.
   */
  onBlockTap?: (resource: Resource, date: Date) => void;
  onDragEnd?: (draft: DraggedEventDraft) => void;
  /**
   * Test seam — production callers should leave this undefined and let
   * the component subscribe to `useAccessibilityStore.preferredHand`
   * directly. Tests pass an explicit value to avoid mocking the store.
   */
  preferredHandOverride?: PreferredHand;
  /**
   * Test seam — production callers should leave this undefined and let
   * the component subscribe to `useCalendarStore.selectedTechIds`
   * directly. Tests pass an explicit value to avoid mocking the store.
   */
  selectedTechIdsOverride?: number[];
  /**
   * Test seam — production callers should leave this undefined and let
   * the component read `useSafeAreaInsets()` directly. Tests pass an
   * explicit value to avoid wrapping the harness in a
   * `SafeAreaProvider`.
   */
  safeAreaInsetsOverride?: { top: number; right: number; bottom: number; left: number };
  /**
   * Test seam — production callers should leave this undefined and let
   * the component measure the calendar wrapper via `onLayout`. Tests
   * pass an explicit value to drive the vendored `<Calendar
   * viewportWidth>` prop deterministically without mounting a layout
   * engine.
   */
  calendarViewportWidthOverride?: number;
  /**
   * Test seam — production callers should leave this undefined and let
   * the component subscribe to `useCalendarStore.landscapeMultiTechMode`
   * directly. Tests pass an explicit value to drive the rendering
   * treatment deterministically.
   */
  landscapeMultiTechModeOverride?: LandscapeMultiTechMode;
  /**
   * Test seam — production callers should leave this undefined and let
   * the component subscribe to `useCalendarStore.setLandscapeMultiTechMode`
   * directly. Tests pass an explicit spy to assert tab segments wire
   * to it with the right mode argument.
   */
  setLandscapeMultiTechModeOverride?: (mode: LandscapeMultiTechMode) => void;
  /**
   * Test seam — production callers should leave this undefined and use
   * the default 200ms cross-fade.
   */
  mapFadeDurationMsOverride?: number;
}


function aggregateEventsForTech(
  weekData: CalendarDayResponse[] | undefined,
  tech: AvatarStripTech,
): RCEvent[] {
  if (!weekData?.length) return [];
  const events: RCEvent[] = [];
  let personalCounter = -1;
  for (const day of weekData) {
    const col: CalendarTechnicianColumn | undefined = day.technicians?.find(
      (t) => t.technician_id === tech.id,
    );
    if (!col) continue;
    for (const appt of col.appointments ?? []) {
      if (!appt.scheduled_time) continue;
      const from = parseTime(appt.scheduled_time);
      const to = appt.scheduled_end_time
        ? parseTime(appt.scheduled_end_time)
        : from + estimateDuration(appt.services);
      events.push({
        id: appt.id,
        resourceId: tech.id,
        date: day.date,
        from,
        to: to <= from ? from + 60 : to,
        title: appt.customer_name,
        description: appt.services?.map((s) => s.service_name).join(", "),
        meta: {
          appointment: appt,
          isPersonal: false,
          slotType: appt.slot_type,
          status: appt.status,
          alertCount: appt.alerts?.length ?? 0,
          bookingMethod: appt.booking_method,
        },
      });
    }
    for (const pe of col.personal_events ?? []) {
      if (!pe.start_time || !pe.end_time) continue;
      events.push({
        id: personalCounter--,
        resourceId: tech.id,
        date: day.date,
        // 2026-04-21 fix: `pe.start_time`/`end_time` are backend
        // `timestamptz` → ISO with `Z`. `parseTime` would return UTC
        // minutes-of-day and place the event at the wrong row. Use
        // the canonical local-minutes helper. Same fix as in
        // `personalEventToEvent` in resource-calendar-mapping.ts.
        // See `.cursor/rules/datetime-and-data-format-contracts.mdc` § 1.
        from: backendISOToLocalMinutes(pe.start_time),
        to: backendISOToLocalMinutes(pe.end_time),
        title: pe.title,
        meta: {
          personalEvent: pe,
          isPersonal: true,
        },
      });
    }
  }
  return events;
}

/**
 * Parse a TZ-naive time string ("HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS")
 * into minutes-from-midnight. Mirror of `timeStringToMinutes` in
 * `resource-calendar-mapping.ts` — kept local to this file because
 * the landscape mapper aggregates differently.
 *
 * DO NOT pass a `timestamptz` ISO. Use `backendISOToLocalMinutes`.
 * See `.cursor/rules/datetime-and-data-format-contracts.mdc` § 1.
 */
function parseTime(value: string): number {
  if (__DEV__ && /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    console.warn(
      "[LandscapeWorkweek] parseTime called with a TZ-aware ISO string — " +
        "use backendISOToLocalMinutes from @technician/utils/datetime instead.",
      { input: value },
    );
  }
  const tail = value.split("T").pop() ?? value;
  const [h = "0", m = "0"] = tail.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function estimateDuration(
  services: { quantity: number }[] | undefined,
): number {
  if (!services || services.length === 0) return 60;
  return services.reduce((s, svc) => s + svc.quantity * 30, 0) || 60;
}

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

export function LandscapeWorkweekView({
  franchiseId = 0,
  selectedDate,
  weekData,
  workweekStartDate,
  hourHeight,
  availableTechs,
  onZoom,
  onEventPress,
  onEventLongPress,
  onBlockLongPress,
  onBlockTap,
  onDragEnd,
  preferredHandOverride,
  selectedTechIdsOverride,
  safeAreaInsetsOverride,
  calendarViewportWidthOverride,
  landscapeMultiTechModeOverride,
  setLandscapeMultiTechModeOverride,
  mapFadeDurationMsOverride,
}: Props) {
  useClearSelectionOnUnmount();

  // P2-FE-8: clear the avatar bbox registry when this view unmounts
  // (rotation away from landscape, navigation off the calendar tab).
  // The strip's tile-unmount path also unregisters per tile, but
  // this is a belt-and-suspenders sweep so the embedded selector
  // never reads stale window-coordinates after the producer is gone.
  const clearAvatarBboxRegistry = useAvatarBboxRegistry((s) => s.clearAll);
  useEffect(() => {
    return () => clearAvatarBboxRegistry();
  }, [clearAvatarBboxRegistry]);

  const storeInsets = useSafeAreaInsets();
  // Notch / Dynamic Island / home-indicator handling. iOS reports
  // `insets.left`/`insets.right` for whichever side the camera notch
  // faces in landscape (it can land on either edge depending on which
  // way the user rotates), and `insets.bottom` for the home indicator.
  // We deliberately do NOT pad `top` because master plan §5.1.1 wants
  // the calendar to extend under the translucent status bar.
  const insets = safeAreaInsetsOverride ?? storeInsets;

  const storePreferredHand = useAccessibilityStore((s) => s.preferredHand);
  const preferredHand = preferredHandOverride ?? storePreferredHand;

  const storeSelectedTechIds = useCalendarStore((s) => s.selectedTechIds);
  const storeMapSelectedTechIds = useCalendarStore((s) => s.mapSelectedTechIds);
  const toggleCalendarTech = useCalendarStore((s) => s.toggleCalendarTech);
  const toggleMapTech = useCalendarStore((s) => s.toggleMapTech);
  // P2-FE-6 (master plan §5.1.7, hover-dwell model): the avatar
  // dwell pattern narrows the visible-techs filter to just the
  // hovered-on tech (preview at buzz 2, commit at buzz 3). We need
  // the wholesale-replace setter, NOT the toggle (toggling would
  // deselect the tech if they were already in the set, which is the
  // wrong narrow semantic — see store JSDoc).
  const setSelectedTechIds = useCalendarStore((s) => s.setSelectedTechIds);
  const selectedTechIds = selectedTechIdsOverride ?? storeSelectedTechIds;
  const mapSelectedTechIds = storeMapSelectedTechIds;
  const selectionCount = selectedTechIds.length;
  const overlayMode = selectionCount >= 2;
  const emptyMode = selectionCount === 0;

  const defaultStart = useCalendarStore((s) => s.displayStartMinutes);
  const defaultEnd = useCalendarStore((s) => s.displayEndMinutes);
  const autoExpand = useCalendarStore((s) => s.displayAutoExpand);

  const storeMultiTechMode = useCalendarStore((s) => s.landscapeMultiTechMode);
  const storeSetMultiTechMode = useCalendarStore((s) => s.setLandscapeMultiTechMode);
  const landscapeMultiTechMode = landscapeMultiTechModeOverride ?? storeMultiTechMode;
  const setLandscapeMultiTechMode = setLandscapeMultiTechModeOverride ?? storeSetMultiTechMode;
  const mapDate = selectedDate ?? workweekStartDate;

  // 2026-05-25 — Live-routes count pill removed per user
  // direction. The pill was the only descriptor LDM-WAVE-1 CHUNK-6
  // shipped and the operator found it redundant (the tech avatar
  // strip already telegraphs how many techs/routes are on the map).
  // Keeping `MapPillRow` mounted (with empty pills) so future
  // chunks can re-add descriptors without re-plumbing the
  // `renderTopChrome` slot; `MapPillRow` short-circuits to `null`
  // when given an empty array (per its own contract docstring).
  const pillsForMap: MapPillDescriptor[] = useMemo(() => [], []);

  const [mapMode, setMapMode] = useState(false);
  const [renderGrid, setRenderGrid] = useState(true);
  const [renderMap, setRenderMap] = useState(false);
  const gridOpacity = useRef(new Animated.Value(1)).current;
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const hasInitializedMapAnimation = useRef(false);
  const fadeDurationMs = mapFadeDurationMsOverride ?? 200;

  useEffect(() => {
    if (!hasInitializedMapAnimation.current) {
      hasInitializedMapAnimation.current = true;
      return;
    }
    if (fadeDurationMs <= 0) {
      if (mapMode) {
        setRenderMap(true);
        setRenderGrid(false);
        gridOpacity.setValue(0);
        mapOpacity.setValue(1);
      } else {
        setRenderGrid(true);
        setRenderMap(false);
        gridOpacity.setValue(1);
        mapOpacity.setValue(0);
      }
      return;
    }
    if (mapMode) {
      setRenderMap(true);
      gridOpacity.setValue(1);
      mapOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(gridOpacity, {
          toValue: 0,
          duration: fadeDurationMs,
          useNativeDriver: true,
        }),
        Animated.timing(mapOpacity, {
          toValue: 1,
          duration: fadeDurationMs,
          useNativeDriver: true,
        }),
      ]).start(() => setRenderGrid(false));
      return;
    }
    setRenderGrid(true);
    gridOpacity.setValue(0);
    mapOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(gridOpacity, {
        toValue: 1,
        duration: fadeDurationMs,
        useNativeDriver: true,
      }),
      Animated.timing(mapOpacity, {
        toValue: 0,
        duration: fadeDurationMs,
        useNativeDriver: true,
      }),
    ]).start(() => setRenderMap(false));
  }, [fadeDurationMs, gridOpacity, mapMode, mapOpacity]);

  const dateObj = useMemo(
    () => new Date(workweekStartDate + "T00:00:00"),
    [workweekStartDate],
  );

  const baseResources: ResourceWithEvents[] = useMemo(() => {
    if (!availableTechs.length) return [];
    return availableTechs.map((tech) => ({
      id: tech.id,
      name: tech.name,
      avatar: tech.profileImageUrl ?? undefined,
      events: emptyMode ? [] : aggregateEventsForTech(weekData, tech),
    }));
  }, [availableTechs, emptyMode, weekData]);

  // P2-FE-5 (course-corrected 2026-04-21): splice the in-flight
  // pending draft into the resources array as a synthetic event. The
  // hook is a no-op when no draft exists. See FloatingDraftCard.tsx.
  const resourcesWithDraft = useResourcesWithDraft(baseResources);

  const { startMinutes, endMinutes } = useMemo(
    () =>
      autoExpand
        ? computeEffectiveDisplayRange(weekData, defaultStart, defaultEnd)
        : { startMinutes: defaultStart, endMinutes: defaultEnd },
    [autoExpand, weekData, defaultStart, defaultEnd],
  );

  // P3-FE-8 (C.12): subscribe to the local pending-reality store so
  // a local intent paints the dashed-yellow overlay immediately
  // without a BE refetch. See `pending-change-overlay-style.ts`.
  const localIntentsRaw = usePendingRealityStore((s) => s.intents);
  const localSessionId = usePendingRealityStore((s) => s.sessionId);
  // PLAN-DEVIATION: 2026-05-11-toggle-stays-in-chip-row — see
  // docs/PLAN-DEVIATIONS.md#2026-05-11-toggle-stays-in-chip-row.
  // PR-UX-5 (2026-05-08) introduced an `EMPTY_INTENTS` short-circuit
  // here that suppressed every chain-driven downstream signal in
  // Future mode: chain graph → 0 chains → chip row unmounts → the
  // `<NowFutureLandscapeToggle />` mounted inside the chip row
  // (chipClusterRightSlot) vanished with it. The 2026-05-10
  // safety-net mount papered over this for landscape; the portrait
  // bug was never fixed. User 2026-05-11: "JUST toggle the look of
  // the toggle, you don't need to disappear or change anything else
  // visually when it's toggled." So the canvas projection still
  // happens via the parent `weekDataForCanvas` substitution — but
  // the chip row, dots, chain pills, and the toggle itself stay
  // mounted in Future mode. Just use `localIntentsRaw` directly.
  const futureMode = useCalendarStore((s) => s.futureMode);
  const localIntents = localIntentsRaw;
  // PR-UX-2 PASS 2.18 (2026-05-05): orphan-session suppression set —
  // see day-view's comment for the full rationale.
  const knownSessionIds = useKnownReorganizationSessionIds();
  const selectedChainId = usePendingRealityStore((s) => s.selectedChainId);
  const setSelectedChainId = usePendingRealityStore(
    (s) => s.setSelectedChainId,
  );
  // PR-UX-2 PASS 2.11 (task `c8`): per-step spotlight set. See
  // workweek-view's matching block for the full rationale.
  const chainStepHighlights = usePendingRealityStore(
    (s) => s.chainStepHighlights,
  );
  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups — aux highlight
  // set surfaced by the chain-to-chain conflict toast.
  const auxHighlightedChainIds = usePendingRealityStore(
    (s) => s.auxHighlightedChainIds,
  );

  // PR-UX-2 PASS 2.3.1 (2026-05-05): host the pulse-singleton
  // subscription at the view level so it's gated on "is a chain
  // selected?" rather than "did the arrow overlay decide to render
  // any arrows?". See MoveChainArrowOverlay's doc-block for the
  // failure mode this fixes.
  useMoveChainPulse(selectedChainId !== null, "view:landscape");

  // Move-chain selector PASS 1 — derive chain graph from the 4-day
  // landscape window. Routed through `useMoveChainGraph` so this
  // mount, the day view, the workweek view, AND the Pending Reality
  // review screen's per-card "Chain N" badge all source from the
  // SAME seam. See the hook's doc-block for the divergence this
  // collapses. Empty intents → empty graph (overlay short-circuits).
  const { graph: moveChainGraph, linterAppointments } = useMoveChainGraph(
    localIntents,
    weekData,
  );

  // 2026-05-08 follow-up #4 (PR-UX-3 bug #2): auto-isolate the
  // just-staged chain. See `use-auto-isolate-on-stage.ts` doc-block
  // for the full rationale; this is the landscape mount of the same
  // hook so a drag on the landscape canvas exhibits the same
  // auto-isolate UX as the portrait day / portrait workweek mounts.
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
  // rationale: when the canvas paints the projected world, every
  // staged appointment has already been moved to its destination,
  // so painting a ghost AT the same destination is a duplicate
  // visual and arrow source = destination is degenerate.
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
      auxHighlightedChainIds,
      chainStepHighlights,
      moveChainGraph,
      localIntents,
      linterAppointments,
      effectiveSelectedChainId,
    ],
  );

  const eventStyleOverrides = useCallback(
    (event: RCEvent): StyleOverrides | undefined => {
      // Palette shift 2026-04-21: real cards become saturated solid
      // per-tech colors (overlayMode already did this — now extended
      // to non-overlay too). The pale SLOT_TYPE_COLORS treatment
      // shifts to drafts where it reads as a soft "in-progress"
      // placeholder against the bold solid cards.
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

  // PR-UX-2 PASS 2.3 (move-chain tile pulse). Mirror of sibling
  // resource-calendar-day-view's `getEventOpacity`; see that file
  // for the full rationale.
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

  // PLAN-DEVIATION: 2026-04-20-revert-empty-array-semantics — back to
  // the historical pattern: pass `undefined` in 0-tech mode (no filter)
  // and let the per-resource `events: []` (set by the `emptyMode` ternary
  // in `resources` above) produce the empty grid. Phase 16 briefly
  // tried passing `[]` to mean "render no resources", but that broke
  // the portrait day view (whose default state is 0 techs selected),
  // so the vendored library is back to the historical "[] === undefined
  // === no filter" semantics. Empty rendering is the consumer's job.
  // See docs/PLAN-DEVIATIONS.md#2026-04-20-revert-empty-array-semantics
  const selectedResourceIds = emptyMode ? undefined : selectedTechIds;

  // 2026-05-12 — arrow lane-order source of truth. Holds the body lane
  // order the vendored Calendar is currently painting from
  // (`bodyResourceIds`). Wired to the new `onBodyResourceIdsChange`
  // prop (FORK Phase 37); fires once on mount and again on every
  // `bodyResourceIds` identity change. Used downstream by
  // `lanesByTechId` so move-chain arrow X-coordinates resolve from
  // the same array the library is actually painting lanes from,
  // not from `selectedTechIds` (selection order). Before this
  // change, a `resources` prop whose ordering didn't match
  // `selectedTechIds` (which happens whenever the user toggles
  // techs in any order other than ascending id) caused arrows to
  // land at the wrong lane X — see
  // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
  const [renderedLaneOrder, setRenderedLaneOrder] = useState<
    readonly number[] | null
  >(null);
  const handleBodyResourceIdsChange = useCallback((ids: number[]) => {
    setRenderedLaneOrder((prev) => {
      if (
        prev &&
        prev.length === ids.length &&
        prev.every((id, i) => id === ids[i])
      ) {
        return prev;
      }
      return ids;
    });
  }, []);
  // First-render fallback (before the library fires its first
  // `onBodyResourceIdsChange` callback): mirror the library's
  // `bodyResourceIds` memo locally so the first arrow pass is
  // already correct. The library computes
  // `resourceIds.filter(id => selectedResourceIds.includes(id))`
  // (= resources-prop order, filtered by selection). When the
  // selection is empty / undefined the filter no-ops to the full
  // list. Once the callback fires we use `renderedLaneOrder`
  // directly — these two paths should agree by construction.
  const fallbackLaneOrder = useMemo(() => {
    const ids = resources.map((r) => r.id);
    if (!selectedResourceIds || selectedResourceIds.length === 0) return ids;
    const selected = new Set(selectedResourceIds);
    return ids.filter((id) => selected.has(id));
  }, [resources, selectedResourceIds]);
  const effectiveLaneOrder = renderedLaneOrder ?? fallbackLaneOrder;

  // BUG-A diagnostic (P2-FE-4 follow-up #15, 2026-04-20): trace the consumer
  // payload that <Calendar> sees on every render of the landscape view so we
  // can answer "why does today's column show events when 0 techs are
  // selected?" 2026-05-07 follow-up — gated behind
  // `VERBOSE_CALENDAR_LOGS` (default off) so this site stops contributing
  // to the per-render log storm that triggered the chip-row freeze. Flip
  // `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1` to opt back in.
  if (VERBOSE_CALENDAR_LOGS) console.log("[BUG-A:LWV]", {
    selectionCount,
    emptyMode,
    overlayMode,
    selectedTechIds,
    selectedResourceIds,
    multiTechModeProp: overlayMode ? landscapeMultiTechMode : undefined,
    weekDataDays: weekData?.length ?? 0,
    weekDataDates: weekData?.map((d) => d.date),
    availableTechIds: availableTechs.map((t) => t.id),
    resourcesSummary: resources.map((r) => ({
      id: r.id,
      eventCount: r.events?.length ?? 0,
      eventDates: r.events?.map((e) => e.date),
    })),
    totalEventsAcrossResources: resources.reduce(
      (sum, r) => sum + (r.events?.length ?? 0),
      0,
    ),
  });

  const stripPlacement: "left" | "right" =
    preferredHand === "left" ? "left" : "right";

  // Calendar wrapper width (threaded into the vendored Calendar via
  // `viewportWidth` so its column-sizing math matches the constrained
  // container instead of the full window). Per landscape-calendar.md
  // §3.6 rule 2 — pass canvas constraints as props, don't have inner
  // components poll dimensions themselves. On the first frame
  // `measuredCalendarWidth` is `null`, so we fall back to the library's
  // historical `useWindowDimensions()` behavior (i.e. pass `undefined`);
  // once `onLayout` fires the correction is ~1 frame away. The layout
  // thrash this causes is a fixed column-width snap, not a scroll jump,
  // so it's visually acceptable and there's no host-side double-render
  // risk (the Calendar already re-renders on `key: numberOfColumns +
  // "-" + width` changes).
  const [measuredCalendarWidth, setMeasuredCalendarWidth] = useState<number | null>(null);
  // PR-UX-2 PASS 2.2: also capture height so the move-chain arrow
  // overlay can size its SVG viewport to the calendar wrap. Height
  // changes when the user rotates / zooms; the overlay re-mounts on
  // change because the geometry depends on it.
  const [measuredCalendarHeight, setMeasuredCalendarHeight] = useState<number | null>(null);

  // P2-FE-6 (master plan §5.1.7): drag-to-avatar coordination.
  //
  // PLAN-DEVIATION: 2026-04-22-hover-dwell-avatar-navigator —
  // avatars are NOT drop targets. They're hover-dwell calendar
  // switchers reachable during a drag. See the hook's module
  // header and docs/PLAN-DEVIATIONS.md for the full model. The
  // hook owns the per-frame highlight hit-test AND the JS-thread
  // 3-stage haptic + selection state machine; all this view does
  // is wire the current selection in so the dwell pattern can
  // narrow / revert.
  //
  // The hook is landscape-only by design; mounted here so a
  // portrait → landscape rotation creates it fresh and a
  // landscape → portrait rotation tears it down (along with any
  // in-flight dwell timers, via its own unmount cleanup).
  //
  // Phase 19 note: prior to FORK Phase 19, this hook needed the
  // calendar wrapper's window origin to translate the calendar-
  // viewport-local pan SVs into window space. Phase 19 replaced
  // that with raw `fingerXAbs`/`fingerYAbs` already in window
  // coords, so the offset plumbing was deleted from both this
  // view and the hook's API.
  const { registerAvatarBbox, highlightedTechIdSV, wasRecentlyDragging } =
    useDragToAvatar({
      selectedTechIds,
      setSelectedTechIds,
    });

  // Avatar tap handler — moved BELOW the `useDragToAvatar` call so it
  // can close over the hook's `wasRecentlyDragging` Bug #2 guard.
  const handleToggleTech = useCallback(
    (techId: number) => {
      // Bug #2 guard (P2-FE-6 follow-on, 2026-04-22): suppress
      // toggles that came from a stray Pressable.onPress fired at
      // drag-end. RN's responder system can deliver
      // `onResponderRelease` to an avatar whose tile happened to be
      // under the user's finger when they lifted off the dragged
      // card; that release reads as a press to the Pressable, even
      // though the active responder was the calendar's pan handler.
      // Without this guard the spurious press toggles
      // `selectedTechIds` and silently undoes the just-committed
      // hover-dwell narrow.
      //
      // 500ms covers the gesture-end → Pressable-onPress propagation
      // gap with room for the post-release haptic burst (success
      // buzz, ~250ms). Real deliberate avatar taps after a drag are
      // a rare flow and the small delay is imperceptible.
      if (wasRecentlyDragging()) return;
      if (mapMode) {
        toggleMapTech(techId);
        return;
      }
      toggleCalendarTech(techId);
    },
    [mapMode, toggleCalendarTech, toggleMapTech, wasRecentlyDragging],
  );

  // P2-FE-6 (hover-dwell model): drag-end subscription. Mounted at
  // the top of `LandscapeWorkweekView` (rather than as a child
  // component) so it shares this view's binding-context-scoped
  // `useDraggedEventDraftSubscription` with the Calendar. Parent
  // `index.tsx` deliberately does NOT mount its own
  // `<RCDragSubscription>` for the landscape branch — two
  // subscriptions on the same library shared value would race the
  // `setDraft(null)` consumption.
  //
  // Under the hover-dwell model this handler is now a pure
  // pass-through: the avatar dwell pattern has already swapped
  // `selectedTechIds` to the destination tech (if any) BEFORE the
  // drop fires, so the parent's `handleRCDragEnd` sees the new
  // resource id naturally and routes the drop through the normal
  // reschedule / reassign / draft-commit path. No avatar branch is
  // needed here — see PLAN-DEVIATION
  // 2026-04-22-hover-dwell-avatar-navigator.
  useDraggedEventDraftSubscription(onDragEnd);

  // PR-UX-12 (2026-05-09): track the calendar wrapper's window-X
  // bounds so the avatar bbox clamp (below) can refuse to extend
  // INTO the calendar viewport. Pre-fix the avatar bbox was
  // measured purely from each tile's `measureInWindow`, which can
  // return coordinates that overlap the calendar grid by a few
  // points (strip border, parent padding, sub-pixel rounding,
  // landscape-rotation transitional layout). The user reported the
  // rightmost lane in 6-tech mode being unreachable as a drop
  // target while the calendar-switch worked correctly — both
  // symptoms point at avatar-hit overlap into the calendar viewport.
  // Capture the bounds via `measureInWindow` on every layout pass
  // so the clamp uses fresh values across rotation / zoom.
  const [calendarWindowBounds, setCalendarWindowBounds] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const calendarWrapperRef = useRef<View>(null);
  const handleCalendarWrapLayout = useCallback((evt: LayoutChangeEvent) => {
    const w = evt.nativeEvent.layout.width;
    const h = evt.nativeEvent.layout.height;
    // PR-UX-12: measure window-X bounds so the avatar bbox clamp
    // can compare against the calendar's right (or left) edge.
    // Wrapped in a `requestAnimationFrame` deferral so the post-
    // commit measurement reads the calendar's final position
    // (mirrors the `AvatarStripSlot.remeasureKey` deferral pattern
    // — both views can be mid-layout-pass on rotation).
    calendarWrapperRef.current?.measureInWindow((x, y, ww, hh) => {
      setCalendarWindowBounds((prev) => {
        if (
          prev != null &&
          prev.x === x &&
          prev.y === y &&
          prev.w === ww &&
          prev.h === hh
        ) {
          return prev;
        }
        return { x, y, w: ww, h: hh };
      });
    });
    if (__DEV__) {
      console.log("[MoveChain:Layout:LS] onLayout", { w, h });
      calendarWrapperRef.current?.measureInWindow((x, y, ww, hh) => {
        console.log("[MoveChain:Wrapper:Pos:LS]", { x, y, w: ww, h: hh });
      });
    }
    if (w > 0) setMeasuredCalendarWidth(w);
    if (h > 0) setMeasuredCalendarHeight(h);
  }, []);
  const [calendarScrollY, setCalendarScrollY] = useState<SharedValue<number> | null>(null);
  const onScrollYRef = useCallback((sv: SharedValue<number>) => {
    if (__DEV__) {
      console.log("[MoveChain:ScrollSV:LS] received", {
        hasSV: !!sv,
        initialValue: sv?.value ?? null,
      });
    }
    setCalendarScrollY(sv);
  }, []);
  // 2026-05-10 — landscape arrow horizontal anchoring bug fix.
  // Stash the calendar's horizontal scroll SV and zoom-pan transform
  // SVs so the move-chain arrow overlay can mirror every transform
  // the body content applies. Without these, 1-finger panning the
  // canvas (which writes `zoomTX`/`zoomTY` via the simultaneous
  // zoomPanGesture) drifts the arrows away from the cards. See
  // `MoveChainArrowOverlay`'s combined `useAnimatedStyle` worklet
  // for the consumer contract.
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
    if (__DEV__) console.log("[MoveChain:Touch:LS] start");
  }, []);
  const onTouchEnd = useCallback(() => {
    if (__DEV__) console.log("[MoveChain:Touch:LS] end");
  }, []);
  useMoveChainScrollLogger(calendarScrollY, "LS");

  // PR-UX-2 PASS 2.2: arrow overlay geometry. Landscape uses the same
  // 4-day workweek window as portrait.
  //
  // PLAN-DEVIATION: 2026-05-10-landscape-arrows-multi-tech — relax the
  // original `selectedTechIds.length === 1` gate. PR-UX-21's
  // documented limitation said cross-tech overlay-mode arrows
  // point to "ambiguous destinations" and were deferred; in
  // practice the user smoke-tested with 4 techs selected and
  // reported "ZERO arrow lines drawn" because the gate made the
  // overlay unreachable in its primary use case.
  //
  // 2026-05-10 follow-up (Bug 2 of the same-day smoke pass):
  // replaced the per-tech compute LOOP with a single multi-tech
  // call via the new `resourceIds: readonly number[]` shape on the
  // workweek layout. The previous per-tech loop dropped cross-tech
  // chain links on the floor — each pass with `resourceId: techId`
  // saw only ONE of the two endpoints, so a reassign from tech A
  // to tech B (both selected) produced ZERO arrow segments because
  // tech A's pass had source-only and tech B's pass had dest-only,
  // both of which silently fall through `resolveStubArrow`'s
  // requirements. User-reported symptom: *"there are no SVG arrows
  // most of the time in landscape."* The single multi-tech pass
  // resolves both endpoints to day-column rects (both selected
  // techs share day-column geometry in landscape's stacked /
  // mini-cols rendering), so the cross-tech reassign produces a
  // real arrow from source-day-col to dest-day-col. X uses the
  // day-column center for both endpoints regardless of which tech
  // they're on; for stacked mode this matches the visual collapse
  // of multiple techs into one column, and for mini-cols mode it's
  // an approximation (the arrow points to col-center rather than
  // the destination tech's sub-lane center, but the user gets a
  // visible directional indicator instead of nothing).
  //
  // See docs/PLAN-DEVIATIONS.md#2026-05-10-landscape-arrows-multi-tech
  // for the carve-out rationale and
  // `compute-move-chain-arrows.ts`'s `resourceIds` doc-block for
  // the geometry contract.
  const landscapeDaysWindow = useMemo(() => {
    const start = dayjs(workweekStartDate);
    return Array.from({ length: WORKWEEK_DAYS }, (_, i) =>
      start.add(i, "day").format("YYYY-MM-DD"),
    );
  }, [workweekStartDate]);
  // 2026-05-10 / 2026-05-12 — mini-cols sub-lane geometry. The vendored
  // library renders mini-cols with `techsToRender.map((trid, i) =>
  // left: i * laneWidth)` where `techsToRender == bodyResourceIds ==
  // resources.map(r=>r.id).filter(id => selectedResourceIds.includes(id))`.
  // We pull that exact ordering from the library via FORK Phase 37's
  // `onBodyResourceIdsChange` callback (stored in `renderedLaneOrder`,
  // with a deterministic first-render fallback in `fallbackLaneOrder`)
  // so the arrow-compute helper places each arrow endpoint at the
  // destination tech's *rendered* sub-lane center — not a position
  // derived from `selectedTechIds` (selection order), which can diverge
  // from `bodyResourceIds` when the user toggles techs in any order
  // other than `resources`-prop order. Only emitted when:
  //   - the current treatment is `mini-columns` (stacked mode collapses
  //     every tech onto the same column-center, so the legacy
  //     day-column geometry is correct there).
  //   - 2+ techs are selected (1-tech mode doesn't slice the column).
  // When omitted, `compute-move-chain-arrows.ts`'s `tileRect` falls
  // back to day-column geometry (= the pre-2026-05-10 behavior).
  //
  // PLAN-DEVIATION: 2026-05-12-arrow-lane-order-from-vendor —
  // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
  const lanesByTechId = useMemo(() => {
    if (landscapeMultiTechMode !== "mini-columns") return undefined;
    if (selectedTechIds.length < 2) return undefined;
    return buildLanesByTechId(
      effectiveLaneOrder,
      measuredCalendarWidth ?? 0,
      WORKWEEK_DAYS,
    );
  }, [
    landscapeMultiTechMode,
    measuredCalendarWidth,
    selectedTechIds.length,
    effectiveLaneOrder,
  ]);
  // FORK Phase 26 (2026-05-10) — per-mount EventBlock bounds
  // registry. Anchors move-chain arrow endpoints to actual card
  // edges. In `mini-columns` mode the EventBlock's onLayout
  // reports rect intra-LANE; in `stacked` mode intra-day-column.
  // `tileRect` handles both branches internally — the consumer
  // just wires the lookup. See README-FORK Phase 26.
  const eventBoundsRegistry = useEventBoundsRegistry();
  const arrowSegments = useMemo(() => {
    if (selectedTechIds.length === 0) {
      if (__DEV__) {
        console.log(
          "[MoveChain:Wire:LS] skip — no techs selected (empty grid mode)",
        );
      }
      return [];
    }
    if (!measuredCalendarWidth || measuredCalendarWidth <= 0) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:LS] skip — no measured width yet", {
          measuredCalendarWidth,
          measuredCalendarHeight,
        });
      }
      return [];
    }
    // 2026-05-13 — see workweek-view's matching block. Future-mode
    // canvas paints appointments at their post-intent destinations,
    // so arrow source = destination → degenerate / wrong-direction
    // arrows. Skip the geometry pass entirely; the chip row + dot
    // row stay mounted so the toggle remains accessible.
    if (futureMode) {
      if (__DEV__) {
        console.log(
          "[MoveChain:Wire:LS] skip — futureMode (canvas shows projected world)",
        );
      }
      return [];
    }
    // 2026-05-13 — registry settling gate. See workweek-view's
    // matching block + `useEventBoundsRegistry.invalidate`
    // doc-block for the rationale.
    if (!eventBoundsRegistry.isSettled) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:LS] skip — registry not settled");
      }
      return [];
    }
    if (selectedChainId == null) {
      if (__DEV__) {
        console.log(
          "[MoveChain:Wire:LS] skip — no chain selected (Show all baseline)",
        );
      }
      return [];
    }
    if (moveChainGraph.chains.length === 0) {
      if (__DEV__) {
        console.log("[MoveChain:Wire:LS] skip — graph has 0 chains");
      }
      return [];
    }
    const TIME_LABEL_WIDTH = 50;
    const appointmentBlockWidth =
      (measuredCalendarWidth - TIME_LABEL_WIDTH) / WORKWEEK_DAYS;
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
        daysWindow: landscapeDaysWindow,
        // 2026-05-10 follow-up — multi-tech mode (see compute helper's
        // `resourceIds` doc-block). Cross-tech reassigns now resolve
        // to real arrows when both techs are selected, replacing the
        // per-tech loop's silent-drop. Empty selection short-circuited
        // by the `selectedTechIds.length === 0` early return above.
        resourceIds: selectedTechIds,
        // 2026-05-10 follow-up #2 — mini-cols sub-lane geometry. When
        // wired (mini-columns mode + 2+ techs), the compute helper
        // resolves each tile's X to the destination tech's sub-lane
        // center instead of the shared day-column center. Solves the
        // *"all landscape arrows showed up in one vertical line"*
        // symptom that the previous `resourceIds`-only fix produced.
        // `undefined` in stacked mode + 1-tech mode (legacy
        // day-column geometry remains correct there).
        lanesByTechId,
        // FORK Phase 26 (2026-05-10): per-mount bounds registry —
        // anchors arrow endpoints to actual card edges. In
        // mini-cols mode the EventBlock's parent is the per-lane
        // wrapper, so `tileRect` adds `colStart + laneOffset +
        // bounds.x`. In stacked mode the parent is the day-column,
        // so it adds `colStart + bounds.x`. Both branches are
        // handled inside `tileRect` — the consumer just needs to
        // wire the lookup. See `useEventBoundsRegistry` +
        // README-FORK Phase 26.
        eventBoundsLookup: eventBoundsRegistry.get,
        // 2026-05-12 — `fix/move-chain-arrow-registry-precision`.
        // Production calendar hosts gate segment emission on
        // both endpoints having a registry-sourced rect, so the
        // user never sees a grid-cell-misaligned arrow. The
        // `useEventBoundsRegistry.tick` settling signal in the
        // useMemo deps below ensures the geometry re-derives
        // once the registry has stabilized. See compute helper
        // doc-block + docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-
        // registry-only-precision.
        requireRegistryRect: true,
      },
      chainStepHighlights,
    );
    if (__DEV__) {
      // 2026-05-10 follow-up logging — one-time-per-render summary
      // capturing the distinct destination Xs the arrow endpoints
      // landed on AND the distinct destination techs that produced
      // them, so a future regression of the "all arrows collapse to
      // one X" symptom is detectable from a single log line rather
      // than by reading per-segment lines.
      // Smoke signature for Bug 1 of the 2026-05-10 follow-up:
      //   `distinctDestX === 1 && distinctDestTechs > 1`
      // distinct dest techs come from `visibleDestSlots` (computed
      // upstream in this component); join them by `intent_id` so
      // we don't double-count chain step duplicates.
      const destXs = new Set<number>();
      for (const s of segs) {
        if (s.to) destXs.add(Math.round(s.to.x * 100) / 100);
      }
      const destTechByIntent = new Map<number, number>();
      for (const slot of visibleDestSlots) {
        destTechByIntent.set(slot.intent_id, slot.technician_id);
      }
      const distinctDestTechSet = new Set<number>();
      for (const s of segs) {
        const tech = destTechByIntent.get(s.intentId);
        if (typeof tech === "number") distinctDestTechSet.add(tech);
      }
      // 2026-05-12 — lane-order divergence diagnostic. When the user
      // toggles techs in any order other than `resources`-prop order,
      // `selectedTechIds` (selection order) and `effectiveLaneOrder`
      // (= the library's `bodyResourceIds`) diverge. Pre-fix, this
      // divergence caused arrow X coordinates to land at the wrong
      // lane center. Logging both makes the divergence visible at a
      // glance during smoke. See
      // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
      const laneOrderMatchesSelection =
        effectiveLaneOrder.length === selectedTechIds.length &&
        effectiveLaneOrder.every((id, i) => id === selectedTechIds[i]);
      console.log("[MoveChain:Wire:LS] computed", {
        selectedChainId,
        chainCount: moveChainGraph.chains.length,
        segmentCount: segs.length,
        distinctDestX: destXs.size,
        distinctDestTechs: distinctDestTechSet.size,
        hasLanesByTechId: lanesByTechId != null,
        laneCount: lanesByTechId?.size ?? 0,
        measuredCalendarWidth,
        measuredCalendarHeight,
        appointmentBlockWidth,
        hourHeight,
        startMinutes,
        selectedTechIds,
        effectiveLaneOrder,
        renderedLaneOrderArrived: renderedLaneOrder != null,
        laneOrderMatchesSelection,
        landscapeDaysWindow,
      });
    }
    return segs;
  }, [
    chainStepHighlights,
    futureMode,
    hourHeight,
    landscapeDaysWindow,
    lanesByTechId,
    linterAppointments,
    localIntents,
    measuredCalendarHeight,
    measuredCalendarWidth,
    moveChainGraph,
    selectedChainId,
    selectedTechIds,
    startMinutes,
    visibleDestSlots,
    // 2026-05-12 — included so the lane-order divergence diagnostic
    // log inside `__DEV__` re-emits when the library reports a new
    // `bodyResourceIds` order (e.g., when the user toggles a tech in).
    effectiveLaneOrder,
    renderedLaneOrder,
    // FORK Phase 26: registry accessor identity is stable across
    // renders (the hook memoizes), so this dep is effectively
    // immutable but kept in the array for completeness.
    eventBoundsRegistry.get,
    // 2026-05-12 — settling-tick signal. The registry's `record`
    // callback writes into a ref-backed Map (no re-render) and
    // additionally schedules a debounced `setTick(t+1)` ~50ms
    // after the last write. Including `tick` in this useMemo's
    // deps re-derives arrow geometry exactly when the registry
    // has stabilized, so the production gate
    // (`requireRegistryRect: true`) transitions from "all
    // segments skipped (grid-only)" to "all segments emitted
    // (registry-sourced)" on the next layout pass — eliminating
    // the mixed-source jitter the gate exists to prevent.
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

  const calendarViewportWidth =
    calendarViewportWidthOverride ?? measuredCalendarWidth ?? undefined;

  // Stable callback bound to the hook's bbox writer. Passed to both
  // `<AvatarStrip>` mounts so each tile's `onLayout` measures into
  // the same SV-backed map.
  //
  // P2-FE-8: also mirrors the bbox into `useAvatarBboxRegistry` so
  // the embedded avatar selector (mounted at the calendar tab root,
  // outside this view's tree) can read each tile's window position
  // and animate chips from the strip into the in-canvas card. The
  // registry is independent of the drag hook's internal SV map so
  // the selector doesn't drag in `useDragSharedValues` (which
  // requires a CalendarBindingProvider ancestor that the FloatingDraftCard
  // host doesn't have).
  const registerAvatarBboxToSelector = useAvatarBboxRegistry(
    (s) => s.registerAvatarBbox,
  );
  // FORK Phase 30.4 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY,
  // 2026-05-07): per-tile dead-zone shrink on the GRID-FACING edge
  // of each avatar bbox before it's handed to the drag-hit-test
  // hook. User report after Phase 30.1 X-edge reachability shipped:
  // *"when I drag over to it and my finger isn't directly over the
  // card, let's say it picked it up a little to the right of the
  // card, I end up hovering over one of the tech avatars,
  // triggering a calendar switch."* Phase 30.1 loosened the
  // `panXAbs` clamp so the floating card's right edge can reach
  // the canvas right edge, but the avatar strip lives flush
  // against that same edge — finger crosses laterally from the
  // rightmost lane into the strip, lingers ≥500ms while the user
  // positions the drop, and the dwell-pattern's buzz-2 narrow
  // fires before they release.
  //
  // Options considered for fixing this (see DEVELOPMENT-LOG entry):
  //   1. Suppress dwell while `isDragging` — breaks the feature
  //      entirely (the dwell-during-drag IS the avatar-switcher).
  //   2. Pointer-events disable on avatar row during drag — same
  //      problem; also kills the highlight ring visual.
  //   3. Z-elevate the dragging card — gesture-system touch routing
  //      doesn't change mid-drag, so wouldn't fix it.
  //   4. Suppress dwell only when `panXAbs` is at the X-edge clamp
  //      — would require a new SV from the vendored calendar plus
  //      threshold tuning per tech-count (more invasive).
  //   5. Shrink the avatar drag-hit bbox on the grid-facing edge
  //      (this approach) — finger has to move ~12pt deeper into
  //      the strip, away from the grid edge, before it counts as a
  //      hover. Layered on top of the existing `wasRecentlyDragging`
  //      tap guard — taps lifting on the avatar at drag-end were
  //      already handled (Bug #2 / 2026-04-22).
  //
  // Picked option 5 because it's the smallest, most reversible
  // change that solves the user's actual symptom without changing
  // the dwell-pattern semantics (= what triggers a switch when the
  // user genuinely lingers on an avatar). The shrink is asymmetric:
  // only the grid-facing edge moves inward. The opposite-side
  // padding is unchanged so a user who lifts off the screen-edge
  // side of the avatar still registers a hover. The selector
  // bbox (used by EmbeddedAvatarSelector for chip slide-down
  // animation) is left at the full tile bbox — that registry has
  // nothing to do with drag hit-testing and shrinking it would
  // misalign the entrance animation start positions.
  //
  // 12pt = LANDSCAPE_AVATAR_PADDING (5pt, the strip's symmetric
  // padding around the 34pt avatar circle) + 7pt buffer (≈ a
  // finger's width's worth of safety). The remaining 32pt hit zone
  // is just under the visible 34pt circle diameter, so the user has
  // to be over the actual avatar dot (not the strip padding) to
  // trigger dwell.
  const AVATAR_DRAG_HIT_GRID_INSET_PT = 12;
  // PR-UX-12 (2026-05-09): hard-floor on how close the avatar
  // drag-hit zone can get to the calendar viewport edge. The
  // 12pt inset above is the natural shrink (strip padding +
  // finger-width buffer); this constant ensures a guaranteed
  // gap between the calendar's outermost lane edge and the
  // avatar drag-hit zone REGARDLESS of how `measureInWindow`
  // reports the slot's window position. Pre-fix the user
  // reported the rightmost lane (lane 5 in 6-tech mode) being
  // unreachable as a drop target while calendar-switch worked
  // correctly — both consistent with the avatar bbox
  // overlapping the calendar's rightmost lane by a few points.
  // 4pt is small enough that the avatar hit-zone shrink is
  // imperceptible, large enough that sub-pixel rounding +
  // landscape-rotation transitional layout cannot push the
  // drag-hit zone back into the lane. Bumping past ~8pt risks
  // re-narrowing the avatar hit zone enough to regress
  // calendar-switch reliability — the same regression PR-UX-10
  // hit at 22pt.
  const AVATAR_VIEWPORT_BUFFER_PT = 4;
  const handleAvatarTileLayout = useCallback(
    (techId: number, bbox: AvatarBbox | null) => {
      let dragBbox = bbox;
      if (bbox) {
        if (stripPlacement === "right") {
          // Strip on right edge → grid is to the LEFT → shrink the
          // LEFT side of bbox (advance `x`, shrink `w`).
          dragBbox = {
            ...bbox,
            x: bbox.x + AVATAR_DRAG_HIT_GRID_INSET_PT,
            w: Math.max(0, bbox.w - AVATAR_DRAG_HIT_GRID_INSET_PT),
          };
        } else {
          // Strip on left edge → grid is to the RIGHT → shrink the
          // RIGHT side of bbox (just shrink `w`, leave `x`).
          dragBbox = {
            ...bbox,
            w: Math.max(0, bbox.w - AVATAR_DRAG_HIT_GRID_INSET_PT),
          };
        }

        // PR-UX-12 (2026-05-09): hard floor — clamp the drag-hit
        // bbox to NOT extend into the calendar viewport. The
        // existing 12pt inset shrinks the bbox in the right
        // direction, but `measureInWindow` can still report
        // window-X coordinates that overlap the grid by a few
        // points (mostly during the landscape-rotation
        // transitional layout when the calendar wrap and the
        // strip are mid-layout). Without this clamp the
        // rightmost lane in 6-tech mini-cols mode is unreachable
        // as a drop target — the user's finger has to fully
        // reach the lane center, but the avatar dwell engages
        // first and switches the calendar. Apply only when we
        // have measured calendar bounds; on the first frame
        // before layout fires we fall back to the inset alone.
        if (calendarWindowBounds) {
          if (stripPlacement === "right") {
            const minBboxX =
              calendarWindowBounds.x +
              calendarWindowBounds.w +
              AVATAR_VIEWPORT_BUFFER_PT;
            if (dragBbox.x < minBboxX) {
              const lostWidth = minBboxX - dragBbox.x;
              const adjusted = {
                ...dragBbox,
                x: minBboxX,
                w: Math.max(0, dragBbox.w - lostWidth),
              };
              if (__DEV__) {
                console.log("[DIAG-AVATAR-BBOX:LS] right-strip clamp", {
                  techId,
                  prePx: { x: dragBbox.x, w: dragBbox.w },
                  postPx: { x: adjusted.x, w: adjusted.w },
                  calendarRightEdge:
                    calendarWindowBounds.x + calendarWindowBounds.w,
                  buffer: AVATAR_VIEWPORT_BUFFER_PT,
                  lostWidth,
                });
              }
              dragBbox = adjusted;
            }
          } else {
            const maxBboxRightEdge =
              calendarWindowBounds.x - AVATAR_VIEWPORT_BUFFER_PT;
            const currentRightEdge = dragBbox.x + dragBbox.w;
            if (currentRightEdge > maxBboxRightEdge) {
              const lostWidth = currentRightEdge - maxBboxRightEdge;
              const adjusted = {
                ...dragBbox,
                w: Math.max(0, dragBbox.w - lostWidth),
              };
              if (__DEV__) {
                console.log("[DIAG-AVATAR-BBOX:LS] left-strip clamp", {
                  techId,
                  prePx: { x: dragBbox.x, w: dragBbox.w },
                  postPx: { x: adjusted.x, w: adjusted.w },
                  calendarLeftEdge: calendarWindowBounds.x,
                  buffer: AVATAR_VIEWPORT_BUFFER_PT,
                  lostWidth,
                });
              }
              dragBbox = adjusted;
            }
          }
        }
      }
      registerAvatarBbox(techId, dragBbox);
      registerAvatarBboxToSelector(techId, bbox);
    },
    [
      registerAvatarBbox,
      registerAvatarBboxToSelector,
      stripPlacement,
      calendarWindowBounds,
    ],
  );

  // Two-strip allocation (master plan §5.1.3 deviation; see
  // DEVELOPMENT-LOG entry "split-middle + secondary overflow strip"):
  //
  //   PRIMARY (edge-flush, 44pt): up to PRIMARY_STRIP_CAPACITY avatars,
  //   split top/bottom with `topOffsetSlots: 1` so the topmost row
  //   clears the calendar header where date labels render. The split
  //   middle is the notch-clearing gap.
  //
  //   SECONDARY (immediately inside the primary, 44pt): everything
  //   above the cap, full-height single scroll. Sits inside iOS's
  //   reported safe-area inset but clear of the actual Dynamic Island
  //   cutout (which only protrudes ~32pt deep) so it can use the
  //   entire vertical extent without notch handling.
  const primaryTechs = availableTechs.slice(0, PRIMARY_STRIP_CAPACITY);
  const overflowTechs = availableTechs.slice(PRIMARY_STRIP_CAPACITY);

  // Notch-aware inset distribution (per-hand, asymmetric by user pref):
  // - The primary strip's split layout clears the notch on the
  //   strip-side edge; secondary strip sits inboard of the cutout.
  //   So the canvas root needs no L/R padding on the strip side.
  // - `paddingBottom` stays at the canvas root so the primary strip's
  //   bottom group, the secondary strip's last avatar, AND the grid's
  //   bottom edge all clear the home indicator without re-stating it
  //   on each child.
  // - The grid's OUTER (strip-opposite) edge gets per-hand treatment:
  //     RIGHT-hand mode (strip on right, time gutter on the LEFT edge)
  //       → NO paddingLeft. The gutter sits flush against the screen
  //         edge. Time labels run small enough that the rounded corner
  //         + Dynamic Island cutout don't visibly occlude them, and
  //         the user explicitly preferred the flush look here.
  //     LEFT-hand mode (strip on left, time gutter on the RIGHT edge)
  //       → KEEP paddingRight: insets.right. Mirror-image rotations
  //         can still land a notch on the right edge that would clip
  //         the rightmost day column's date label, and the user
  //         prefers the current inset look in this mode.
  //   This asymmetry is intentional, per the user's screenshot
  //   feedback after P2-FE-4 follow-up #6 shipped.
  const calendarInset =
    stripPlacement === "right"
      ? undefined
      : { paddingRight: insets.right };

  return (
    <View
      style={[
        styles.container,
        stripPlacement === "left" ? styles.containerStripLeft : styles.containerStripRight,
        { paddingBottom: insets.bottom },
      ]}
      testID="landscape-workweek-view"
    >
      <AvatarStrip
        techs={primaryTechs}
        selectedTechIds={mapMode ? mapSelectedTechIds : selectedTechIds}
        onToggleTech={handleToggleTech}
        accessibilityLabel="Calendar technician filter"
        splitMiddle
        topOffsetSlots={1}
        // P2-FE-6: drag-to-avatar wiring. The strip paints the
        // highlight ring per-frame from `highlightedTechIdSV` and
        // reports each tile's window bbox via `onTileLayout` for
        // the centroid hit-test in `useDragToAvatar`.
        // Suppressed in `mapMode` because no card drag is possible
        // while the route map is up — passing `undefined` keeps the
        // animated style worklet on the no-op branch and skips the
        // bbox plumbing entirely.
        dragHighlightedTechIdSV={mapMode ? undefined : highlightedTechIdSV}
        onTileLayout={mapMode ? undefined : handleAvatarTileLayout}
        // P2-FE-6 follow-up: bumping `remeasureKey` whenever the
        // calendar wrap's measured width changes forces every slot
        // to re-run `measureInWindow`. Required because the LWV
        // container starts at portrait dimensions during the
        // rotation-into-landscape transition (slots' onLayout fires
        // and registers bboxes at that transitional position) and
        // grows to full landscape width on the next layout pass —
        // the slots' own size doesn't change, so onLayout doesn't
        // re-fire, leaving stale bboxes hundreds of points to the
        // left of the avatars' actual rendered position. See
        // AvatarStripSlot's "ancestor-resize re-measurement"
        // comment for the full diagnosis.
        // PR-UX-12 (2026-05-09): also re-fire when the calendar's
        // window-X position changes (rare but possible without a
        // width change — e.g., an inset-only relayout). Without
        // this the bbox clamp could read stale calendar bounds.
        remeasureKey={
          mapMode
            ? undefined
            : `${measuredCalendarWidth ?? "?"}:${calendarWindowBounds?.x ?? "?"}`
        }
      />
      {overflowTechs.length > 0 ? (
        <AvatarStrip
          techs={overflowTechs}
          selectedTechIds={mapMode ? mapSelectedTechIds : selectedTechIds}
          onToggleTech={handleToggleTech}
          accessibilityLabel="Calendar technician filter — overflow"
          style={styles.secondaryStrip}
          dragHighlightedTechIdSV={mapMode ? undefined : highlightedTechIdSV}
          onTileLayout={mapMode ? undefined : handleAvatarTileLayout}
          remeasureKey={
            mapMode
              ? undefined
              : `${measuredCalendarWidth ?? "?"}:${calendarWindowBounds?.x ?? "?"}`
          }
        />
      ) : null}
      <View
        ref={calendarWrapperRef}
        style={[styles.calendarWrap, calendarInset]}
        testID="landscape-workweek-grid"
        onLayout={handleCalendarWrapLayout}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {renderGrid ? (
          <Animated.View
            pointerEvents={mapMode ? "none" : "auto"}
            style={[styles.surfaceLayer, { opacity: gridOpacity }]}
            testID="landscape-grid-layer"
          >
            <Calendar
              mode="3days"
              multiDayCount={WORKWEEK_DAYS}
              date={dateObj}
              resources={resources}
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
              selectedResourceIds={selectedResourceIds}
              // FORK Phase 37 (2026-05-12 — arrow lane-order source of
              // truth): subscribe to the library's `bodyResourceIds`
              // identity. `lanesByTechId` above derives arrow X
              // coordinates from this exact order so they line up with
              // the lanes the body grid is actually painting. See
              // docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
              onBodyResourceIdsChange={handleBodyResourceIdsChange}
              viewportWidth={calendarViewportWidth}
              // FORK Phase 26 (2026-05-10 — move-chain arrow
              // alignment): capture each EventBlock's post-style
              // rendered rect into a per-mount registry so arrow
              // endpoints land flush against visible card edges.
              // See README-FORK Phase 26.
              onEventLayout={eventBoundsRegistry.record}
              // FORK Phase 12 / Ship 1: suppress the time-gutter `StaffAvatar`
              // in the calendar header. Landscape has its own AvatarStrip
              // (and at 2+ techs the in-grid avatar is misleading because it
              // pins to `resourceIds[0]` regardless of `selectedResourceIds`).
              // Day labels stay aligned with their body columns because the
              // gutter `Col` still renders empty.
              showResourceHeader={false}
              // FORK Phase 13/14 (Ship 2/3, P2-FE-4 follow-up): when 2+
              // techs are selected, ask the vendored Calendar to render
              // every selected tech's events using the chosen treatment
              // instead of the legacy single-resource path that pinned all
              // events to `bodyResourceIds[0]`. In 0-tech and 1-tech modes
              // we pass `undefined` so the Calendar stays on the historical
              // single-resource code path (no behavior change). Ship 3
              // narrowed the choice to `stacked` | `mini-columns` after
              // user evaluation cut the `stacked-bands` treatment.
              multiTechMode={overlayMode ? landscapeMultiTechMode : undefined}
              // FORK Phase 28.2-logging (P3-FE-DRAG-GHOST follow-up,
              // 2026-05-06): tag every `[CAL:*]` log emitted by this
              // calendar instance with `WORKWEEK-LANDSCAPE` so smoke
              // logs don't get mixed up with the other two calendars
              // mounted in the franchise app (DAY-PORTRAIT,
              // WEEK-PORTRAIT). See README-FORK Phase 28.2-logging.
              calendarId="WORKWEEK-LANDSCAPE"
              onScrollYRef={onScrollYRef}
              onScrollXRef={onScrollXRef}
              onContentTransformRef={onContentTransformRef}
              // FORK Phase 21 (P3-FE-DRAG-GHOST chunk b): per-tech color
              // resolver wired to our existing `colorForTech` helper.
              // Used only by the vendored drop-target ghost overlay,
              // which only mounts when `multiTechMode === "mini-columns"
              // && bodyResourceIds.length >= 2` — so this prop is a
              // no-op in single-tech and "stacked" modes. Tinting the
              // ghost with the same color the source card uses gives
              // the user a clear "this lane is Dan's" signal without
              // any extra plumbing. See README-FORK Phase 21.
              getResourceColor={colorForTech}
            />
            {/* 2026-05-10 (arrow paints-through-cards fix, attempt 2):
                MoveChainArrowOverlay used to live HERE — as a child of
                the `surfaceLayer` Animated.View. iOS rasterizes that
                whole subtree because of the `opacity: gridOpacity`
                shared value on `surfaceLayer`, and inside the
                rasterized layer the SVG view doesn't reliably
                outrank EventBlocks' CALayer.zPosition (set by the
                vendored lib's `1000 + leftIndex` formula). The
                overlay was lifted to a sibling of the entire
                `renderGrid` block (below) so it gets its own
                compositing layer above the rasterized grid. See the
                detailed comment in `MoveChainArrowOverlay.tsx`'s
                `styles.container` for the full diagnosis. */}
            {overlayMode && !mapMode ? (
              // PLAN-DEVIATION: 2026-04-20-cycle-chip-to-edgetab — the
              // landscape-overlay-rendering.md Ship 2 design specified an
              // always-visible cycle chip in the TOP-LEFT corner of the
              // calendar. Ship 3 replaced it with this collapsible EdgeTab
              // anchored to the bottom corner per the user's preferred
              // hand, to avoid gesture conflict with the busy header strip
              // and the iOS home-indicator swipe area. Don't move it back
              // to the top corner. Full context:
              // docs/PLAN-DEVIATIONS.md#2026-04-20-cycle-chip-to-edgetab
              <EdgeTab
                edge={preferredHand}
                alignment="end"
                panelSize={188}
                testID="landscape-multi-tech-tab"
                // Lift the wrapper above the home indicator. EdgeTab
                // anchors to `bottom: 0` for `alignment="end"`; this
                // override stacks an extra `bottom` value that wins.
                containerStyle={{ bottom: insets.bottom + 8 }}
                handleStyle={styles.tabHandleWrap}
                panelStyle={styles.tabPanel}
                handle={({ isOpen, toggle }) => {
                  const handleIcon = handleChevronName(preferredHand, isOpen);
                  return (
                    <Pressable
                      testID="landscape-multi-tech-tab-handle-pressable"
                      accessibilityRole="button"
                      accessibilityLabel={
                        isOpen
                          ? "Close multi-tech rendering picker"
                          : "Open multi-tech rendering picker"
                      }
                      onPress={toggle}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.tabHandle,
                        pressed ? styles.tabHandlePressed : null,
                      ]}
                    >
                      <MaterialIcons name={handleIcon} size={18} color="#FFFFFF" />
                    </Pressable>
                  );
                }}
              >
                <View style={styles.segmentedControl}>
                  {LANDSCAPE_MULTI_TECH_MODES.map((mode) => {
                    const isActive = mode === landscapeMultiTechMode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => setLandscapeMultiTechMode(mode)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={`Switch to ${MULTI_TECH_MODE_LABEL[mode]} rendering`}
                        testID={`landscape-multi-tech-segment-${mode}`}
                        style={({ pressed }) => [
                          styles.segment,
                          isActive ? styles.segmentActive : null,
                          pressed ? styles.segmentPressed : null,
                        ]}
                        hitSlop={4}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.segmentText,
                            isActive ? styles.segmentTextActive : null,
                          ]}
                        >
                          {MULTI_TECH_MODE_LABEL[mode]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </EdgeTab>
            ) : null}
          </Animated.View>
        ) : null}
        {renderMap ? (
          <Animated.View
            pointerEvents={mapMode ? "auto" : "none"}
            style={[styles.surfaceLayer, { opacity: mapOpacity }]}
            testID="landscape-map-layer"
          >
            <FranchiseRouteMap
              date={mapDate}
              franchiseId={franchiseId}
              fullBleed
              renderTopChrome={<MapPillRow pills={pillsForMap} />}
            />
          </Animated.View>
        ) : null}
        {/* 2026-05-10 (arrow paints-through-cards fix, attempt 2):
            MoveChainArrowOverlay rendered HERE as a sibling of the
            two `surfaceLayer` Animated.Views inside `calendarWrap`,
            instead of as a child of the grid-layer surfaceLayer
            where it used to live. The lift gives the overlay its
            own compositing layer outside the rasterized grid
            surfaceLayer, so the SVG strokes paint above every
            EventBlock regardless of the card's CALayer.zPosition.
            Position math is identical because both the surfaceLayer
            and this sibling reference `calendarWrap` as their
            containing block (the overlay's container styles set
            `position: absolute, left: 0, top: bodyTopOffset` with
            `width / height` props — same coordinate origin). The
            overlay is also gated on `!mapMode` so arrows don't
            paint over the map view when the user toggles in the
            route map. */}
        {arrowSegments.length > 0 &&
        measuredCalendarWidth &&
        measuredCalendarHeight &&
        !mapMode ? (
          <MoveChainArrowOverlay
            segments={arrowSegments}
            width={measuredCalendarWidth}
            height={measuredCalendarHeight}
            // Landscape suppresses the resource header (`showResourceHeader={false}`)
            // so the only top chrome is the date strip — same offset
            // as portrait workweek.
            bodyTopOffset={LANDSCAPE_BODY_TOP_OFFSET}
            active={selectedChainId != null}
            scrollYRef={calendarScrollY ?? undefined}
            scrollXRef={calendarScrollX ?? undefined}
            zoomTXRef={calendarZoomTX ?? undefined}
            zoomTYRef={calendarZoomTY ?? undefined}
          />
        ) : null}
        <MapToggleButton
          mapMode={mapMode}
          onMapModeChange={setMapMode}
          preferredHandOverride={preferredHandOverride}
          safeAreaInsetsOverride={safeAreaInsetsOverride}
        />
        {/* PLAN-DEVIATION: 2026-05-11-toggle-stays-in-chip-row —
            see docs/PLAN-DEVIATIONS.md#2026-05-11-toggle-stays-in-chip-row.
            PR-UX-15 (2026-05-09) — landscape Now⇄Future toggle.
            2026-05-10 follow-up #1 (`da843fc`): relocated from a
            corner-anchored standalone pill into the chip row's
            `chipClusterRightSlot` (Row 2, on the dot-row line).
            2026-05-10 follow-up #2 (`cedf0df`): user reported the
            Row-2 placement put the toggle "right over the line of
            dots" — relocated to `headerRowRightSlot` (Row 1,
            beside the carousel header). This commit KEEPS that
            Row 1 placement.
            2026-05-11 root-cause fix (this commit): the original
            disappearing-on-tap bug was previously papered over by
            the corner-anchored safety-net mount (now deleted
            below). Root cause was the `EMPTY_INTENTS` short-
            circuit collapsing the chain graph in Future mode (see
            the localIntents assignment up top), which unmounted
            the chip row + the toggle inside it. With the short-
            circuit removed, the chip row stays mounted in Future
            mode and the toggle never disappears — so the safety
            net is redundant. Toggle self-gates on
            `intents.length > 0`. */}
        {/* P3-FE-3: landscape entry point into the Pending Reality
            review screen. Stacks under `MapToggleButton` on the
            edge opposite the avatar strip. The HUD is its own
            visibility gate (renders null when no intents are
            staged) so we can mount it unconditionally here. */}
        <PendingRealityHUD
          preferredHandOverride={preferredHandOverride}
          safeAreaInsetsOverride={safeAreaInsetsOverride}
        />
        {/* Move-chain selector PASS 1 — landscape mount. Sibling of
            the HUD rather than a child: the HUD is a 44pt corner
            pill and competing for that anchor would clobber its
            visual identity.
            PR-UX-11 (2026-05-09): the chip bar is now draggable —
            long-press 250ms to arm, then drag to one of six anchor
            points (4 corners + top-center + bottom-center). The
            DEFAULT corner is `tc` (top-center, identical to the
            pre-PR-UX-11 hard-coded layout), and the choice persists
            across app launches via AsyncStorage. The outer wrapper
            absorbs the safe-area insets so the chip bar always
            clears the notch / Dynamic Island regardless of which
            corner the user picked. Self-gated visibility (renders
            null when no chains exist). */}
        {moveChainGraph.chains.length > 0 ? (
          // 2026-05-10 chip-bar drawer — pass `chains.length` as the
          // activity key so a brand-new chain (or the disappearance of
          // the only chain followed by a re-add) auto-expands the
          // drawer if the user was idle. The host owns the 15 s
          // idle-collapse policy via `useChipBarAutoHide`.
          <DraggableChipBarHost
            insets={insets}
            activityKey={moveChainGraph.chains.length}
          >
            <MoveChainChipRow
              graph={moveChainGraph}
              selectedChainId={selectedChainId}
              onSelect={setSelectedChainId}
              headerRowRightSlot={<NowFutureLandscapeToggle />}
            />
          </DraggableChipBarHost>
        ) : null}
        {/* PLAN-DEVIATION: 2026-05-11-toggle-stays-in-chip-row —
            see docs/PLAN-DEVIATIONS.md#2026-05-11-toggle-stays-in-chip-row.
            Safety-net mount removed. The 2026-05-10 follow-up #3
            corner-anchored safety net existed solely because the
            `EMPTY_INTENTS` short-circuit collapsed the chain graph
            in Future mode, which unmounted the chip-row + the
            toggle inside it. With that short-circuit removed (see
            the localIntents assignment up top), the chip row stays
            mounted in Future mode and the toggle never disappears,
            so a duplicate corner-anchored mount is no longer
            needed. */}
      </View>
    </View>
  );
}

// Approximate height of the landscape date-strip header. Tunable
// from observed device behavior; revisit if the date strip resizes.
const LANDSCAPE_BODY_TOP_OFFSET = 44;

/**
 * PR-UX-11 (2026-05-09): draggable chip-bar wrapper.
 *
 * The pre-PR-UX-11 chip bar was hard-anchored at top-center via:
 *   `{ position: "absolute", left: 0, right: 0, alignItems: "center" }`
 * User report: *"that same chip bar gets in the way of the top of the
 * screen, so it should be draggable if possible."*
 *
 * This wrapper turns the chip bar into a long-press-armed draggable
 * that snaps to one of six anchor points on release (4 corners +
 * top-center + bottom-center). The default anchor is `tc` so the
 * chip bar lands at the legacy position the first time the user opens
 * a chained session; the choice persists per `useDraggableHud`'s
 * AsyncStorage key.
 *
 * Why a wrapper component (vs. inlining the hook in
 * `LandscapeWorkweekView`): the hook owns its own drag-state
 * machine, gesture composition, and Reanimated SVs. Mounting it
 * inside the parent's `return` would re-run on every parent render
 * and break the gesture's state captures. A sibling component
 * scopes the hook's lifecycle to the chip-bar mount only.
 *
 * PR-UX-10's earlier attempt (PanResponder + `pointerEvents=
 * "box-none"`) silently broke long-press detection because
 * `box-none` made the wrapper transparent to touches, which means
 * `onStartShouldSetPanResponder` was never called and the long-press
 * timer never started. RNGH gestures don't depend on
 * `pointerEvents`, so this wrapper leaves it at the default `"auto"`.
 */
function DraggableChipBarHost({
  insets,
  children,
  activityKey,
}: {
  insets: { top: number; bottom: number; left: number; right: number };
  children: React.ReactNode;
  /**
   * 2026-05-10 chip-bar drawer — when this value changes between
   * renders, the `useChipBarAutoHide` hook treats the change as fresh
   * activity and re-expands the bar. Parent passes
   * `moveChainGraph.chains.length` so a new chain landing while the
   * user is idle pops the bar back open.
   */
  activityKey?: unknown;
}) {
  // 2026-05-10 drawer behavior — drives the collapsed/expanded
  // toggle and the 15 s idle timer. Mounted BEFORE `useDraggableHud`
  // so the draggable's `onSnap` callback (below) can reference
  // `collapseNow` to support the user's "drag to edge to hide"
  // gesture.
  const {
    collapsed,
    expand,
    recordActivity,
    collapseNow,
  } = useChipBarAutoHide({ activityKey });

  // "Push to hide" gesture — when the user releases the drag with
  // their finger within `EDGE_DISMISS_PT` of the top or bottom
  // edge of the visible window (and the snap landed at a matching
  // corner), collapse immediately so the bar feels like it was
  // pushed off-screen rather than just docked. The user's
  // 2026-05-10 spec: *"I should be able to push it up (or down)
  // 'off' the screen and it hide itself too."*
  //
  // Threshold = 60pt. Chosen empirically: about half a thumb
  // travel from the screen edge; large enough to invite the
  // gesture, tight enough that the user can still dock at the
  // edge without triggering it (release between 60pt and ~mid-
  // screen = snap-only; release within 60pt of either edge =
  // snap + collapse).
  const EDGE_DISMISS_PT = 60;
  const onChipBarSnap = useCallback(
    (info: {
      corner: HudCorner;
      releaseFingerX: number;
      releaseFingerY: number;
      windowWidth: number;
      windowHeight: number;
    }) => {
      const releasedAtTopEdge =
        info.corner.startsWith("t") &&
        info.releaseFingerY < EDGE_DISMISS_PT;
      const releasedAtBottomEdge =
        info.corner.startsWith("b") &&
        info.releaseFingerY > info.windowHeight - EDGE_DISMISS_PT;
      if (releasedAtTopEdge || releasedAtBottomEdge) {
        collapseNow();
      }
    },
    [collapseNow],
  );

  const draggable = useDraggableHud({
    defaultCorner: "tc",
    edgeInset: 8,
    storageKey: "@remi/landscape-hud-corner/move-chain-chip",
    onSnap: onChipBarSnap,
  });
  const {
    gesture: chipGesture,
    style: draggableStyle,
    isDragging,
    onLayout: onDraggableLayout,
    corner,
  } = draggable;

  // Capture-phase touch observer: returns `false` so we don't claim
  // the responder; we just want to see that a touch began somewhere
  // in the expanded popover (chip tap, toggle press, carousel
  // chevron press) and refresh the idle timer. RNGH's drag gesture
  // runs on the native thread and triggers a separate activity
  // ping below via `isDragging`.
  const onPopoverTouchCapture = useCallback(() => {
    if (collapsed) {
      expand();
    } else {
      recordActivity();
    }
    return false;
  }, [collapsed, expand, recordActivity]);

  // When the drag arms (long-press → drag-active), refresh the
  // idle timer so the user has the full 15 s window after their
  // drag completes to interact with the bar. We compare against
  // the previous `isDragging` value via a ref so we only fire on
  // the false → true edge.
  //
  // 2026-05-10 — drag from a COLLAPSED notch must NOT re-expand
  // the bar. The user can drag the notch between top / bottom
  // edges (or to a side corner) without forcing the popover open;
  // popping back to expanded mid-drag would fight the user's
  // intent. The `recordActivity` call is gated behind `!collapsed`
  // so the timer only refreshes for the expanded state.
  const wasDraggingRef = useRef(isDragging);
  useEffect(() => {
    if (isDragging && !wasDraggingRef.current && !collapsed) {
      recordActivity();
    }
    wasDraggingRef.current = isDragging;
  }, [collapsed, isDragging, recordActivity]);

  return (
    // Outer wrapper absorbs the safe-area insets so the chip bar
    // always sits inside the visible viewport regardless of which
    // corner the user has dragged it to. `pointerEvents="box-none"`
    // lets touches outside the inner draggable fall through to the
    // calendar canvas underneath.
    <View
      style={{
        position: "absolute",
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        zIndex: 105,
      }}
      pointerEvents="box-none"
    >
      {/* PR-UX-13 (2026-05-09) Issue A — restored chip bar to its
          pre-PR-UX-11 width AND scoped the long-press gesture target
          to the visible pill only. PR-UX-11 moved `maxWidth: "70%"`
          from the inner pill onto this draggable wrapper, which on
          the default `tc` corner anchor (`left: 0, right: 0,
          alignItems: "center"`) clashed with the corner anchor
          geometry: `maxWidth: 70%` against `left: 0, right: 0`
          collapsed the wrapper width below the chip row's natural
          measure (the chip row uses a `flex: 1` carousel header
          inside `headerRow` that returns 0 in unbounded width).
          The user reported "chips container is still too small to
          read what it contains."
          Fix:
            (1) `cornerAnchorStyle` in `useDraggableHud` now produces
                a full-width band on every corner (alignItems-based
                horizontal placement), giving the chip row's
                flex-based layout a determinate parent width.
            (2) Visual size cap moves back to the inner pill via
                `landscapeMoveChainStyles.pill.maxWidth: "70%"`.
            (3) The band wrapper carries `pointerEvents="box-none"`
                so band-internal taps OUTSIDE the pill fall through
                to the calendar canvas. The `GestureDetector` wraps
                the pill (not the band), so RNGH only sees touches
                on the visible pill — without this, a long-press in
                the empty 15%-margin on either side of a `tc` band
                would still arm the drag with the finger 15-30% off
                from the pill, snapping the pill to the user's
                touch on release. */}
      <ReanimatedAnimated.View
        style={[...draggableStyle, { zIndex: 105 }]}
        pointerEvents="box-none"
        testID="landscape-move-chain-chip-host"
        onLayout={(evt) => {
          onDraggableLayout(evt);
          if (__DEV__) {
            const { x, y, width, height } = evt.nativeEvent.layout;
            console.log("[DIAG-CHIP-DRAG] host onLayout", {
              parentRelative: { x, y, width, height },
              isDraggable: true,
              positionAnchor: `corner:${corner}`,
              isDragging,
            });
          }
        }}
      >
        <GestureDetector gesture={chipGesture}>
          {collapsed ? (
            // 2026-05-10 drawer collapsed state — the chip bar
            // compresses to a small handle ("notch") flush with the
            // docked edge. Tap to expand; long-press still arms the
            // existing drag so the user can reposition the notch
            // between top and bottom edges without expanding first.
            // The `Pressable` and the outer `GestureDetector` see
            // touches simultaneously — short taps fire the
            // Pressable's `onPress` (RNGH's gestures don't claim
            // quick taps), long-presses arm the drag.
            <ChipBarNotch
              onPress={expand}
              testID="landscape-move-chain-chip-notch"
            />
          ) : (
            <View
              style={landscapeMoveChainStyles.pill}
              onStartShouldSetResponderCapture={onPopoverTouchCapture}
            >
              {children}
            </View>
          )}
        </GestureDetector>
      </ReanimatedAnimated.View>
    </View>
  );
}

/**
 * `ChipBarNotch` (2026-05-10).
 *
 * Collapsed-state surface for the landscape Move-Chain chip bar.
 * Renders as a small rounded pill with a centered grabber handle —
 * visual cue that the bar can be re-expanded (tap) or moved
 * (long-press → drag). Sits inside the same `DraggableChipBarHost`
 * GestureDetector so the existing long-press-to-drag flow continues
 * to work; the inner `Pressable` handles short taps for expand.
 *
 * The grabber is centered vertically so the notch looks identical
 * whether docked at the top or bottom edge — no per-edge variant
 * needed because the host's corner-anchor style already handles
 * positioning.
 */
function ChipBarNotch({
  onPress,
  testID,
}: {
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={landscapeMoveChainStyles.notch}
      hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
      accessibilityRole="button"
      accessibilityLabel="Expand move-chain chip bar"
      accessibilityHint="Tap to reveal the chain selector; long-press to drag to the top or bottom edge."
      testID={testID}
    >
      <View style={landscapeMoveChainStyles.notchGrabber} />
    </Pressable>
  );
}

const landscapeMoveChainStyles = StyleSheet.create({
  // PR-UX-11 (2026-05-09): the legacy `host` static style was
  // deleted — `useDraggableHud` now owns the corner-anchored
  // position-absolute style on the wrapper. The pill style stays as
  // the inner visual chrome (rounded corners, shadow, background).
  //
  // PR-UX-13 (2026-05-09) Issue A: restored `maxWidth: "70%"` here
  // to match origin/main's visual width cap. PR-UX-11 hoisted this
  // onto the draggable wrapper inline style, which collided with
  // the `tc`/`bc` corner anchor's `left: 0, right: 0` geometry and
  // collapsed the wrapper below the chip row's natural width. The
  // wrapper now leaves visual sizing to the pill so the layout math
  // reads exactly like the pre-PR-UX-11 hard-anchored host did. See
  // `DraggableChipBarHost` in this file for the matching `width:
  // "70%"` override on non-center corners.
  //
  // PR-UX-14 (2026-05-09) Issue A follow-up: the user reported on
  // the smoke pass that the carousel-header counter ("Ecosystem N
  // of M · K chain(s)") was rendering truncated to a few pixels
  // when the active ecosystem only contained one chain. Diagnostic
  // logs (`[DIAG-CHIP-LAYOUT] ecosystemCarouselHeader onLayout`)
  // showed widths of 8, 31, 55, 79, 103 pt — well below the ~250pt
  // the counter text needs to render in full. Root cause: the pill
  // was content-sized (no `minWidth`), so a sparse chip cluster (1
  // chain = 1 dot) gave the wrap (and therefore the carousel
  // header `flex:1` child) very little room to expand into.
  //
  // 2026-05-10 user fix #2: the user reported the carousel label
  // was STILL too short to read despite the 340pt minWidth, and
  // also walked back the "65% max" constraint: *"The whole 65% of
  // the screen thing was just for that initial design. It doesn't
  // need to apply now. I just would like it not to overtake the
  // entire screen, but we can figure that out along the way."*
  //
  // Fix:
  //   - `minWidth: 340 → 480` so the carousel header gets ~250pt
  //     of headroom for the counter text (Show none ≈ 82pt, Show
  //     all ≈ 75pt, Now/Future toggle ≈ 78pt, 3×6pt gaps = ~253pt
  //     consumed; 480 - 20 (wrap padding) - 253 = 207pt left for
  //     the carousel header, enough for the full counter text
  //     after `letterSpacing` is dropped — see MoveChainChipRow
  //     `ecosystemCarouselLabel`).
  //   - `maxWidth: "65%" → "90%"` — keeps the pill from going
  //     truly edge-to-edge (the corner-peeking design that drove
  //     the 65% cap is retired) but lets the content size freely
  //     up to most of the screen on small landscape devices. The
  //     content rarely reaches this cap in practice.
  //   - `borderRadius: 24 → 16` reduces the optical whitespace
  //     inside the rounded corners, which was reading to the user
  //     as "too tall."
  pill: {
    minWidth: 480,
    maxWidth: "90%",
    // 2026-05-10 user fix #3: dropped 16 → 10. The deeper curve at
    // 16pt was reading as "empty white space at the bottom of the
    // pill" — the rounded-corner negative space is purely
    // decorative and was making the pill look ~30pt taller than
    // its actual content extent. 10pt keeps the pill obviously
    // rounded without the visual bottom-band.
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  // 2026-05-10 drawer collapsed state — small rounded pill that
  // sits at the docked edge. Width is intentionally narrow (60pt)
  // so it's a visible affordance without obscuring the calendar.
  // Background + shadow match the expanded pill so the collapse
  // reads as the same surface shrinking, not a different element.
  notch: {
    width: 60,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  // Inner grabber line — iOS sheet-handle convention (32×4 capsule
  // in mid-tone grey) signals "draggable handle." Sits centered so
  // a top-docked and bottom-docked notch render identically.
  notchGrabber: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#9CA3AF",
  },
});

// PLAN-DEVIATION: 2026-04-20-cut-stacked-bands — was 3 entries in
// Ship 2. See docs/PLAN-DEVIATIONS.md#2026-04-20-cut-stacked-bands.
const MULTI_TECH_MODE_LABEL: Record<LandscapeMultiTechMode, string> = {
  stacked: "Overlap",
  "mini-columns": "Mini-cols",
};

/**
 * Pick the chevron that visually indicates the panel direction:
 *
 *   - right-strip + closed → `chevron-left`  ("tap to open inward")
 *   - right-strip + open   → `chevron-right` ("tap to close back to side")
 *   - left-strip  + closed → `chevron-right`
 *   - left-strip  + open   → `chevron-left`
 */
function handleChevronName(
  hand: PreferredHand,
  isOpen: boolean,
): "chevron-left" | "chevron-right" {
  if (hand === "right") return isOpen ? "chevron-right" : "chevron-left";
  return isOpen ? "chevron-left" : "chevron-right";
}

/**
 * Maximum avatars in the primary edge-flush strip. Two top + two bottom
 * is the ergonomic sweet spot on iPhone 15 Pro landscape (393pt short
 * edge): a 1-slot top offset (44pt) clears the date label, the top
 * group occupies the next 88pt, the notch-clearing gap takes the
 * middle, and the 88pt bottom group sits above the home indicator.
 * Anything above 4 avatars goes to the secondary strip.
 */
const PRIMARY_STRIP_CAPACITY = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
  },
  containerStripLeft: {
    flexDirection: "row",
  },
  containerStripRight: {
    flexDirection: "row-reverse",
  },
  // The secondary strip sits immediately inside the primary one; its
  // own borders give it the same affordance as the primary, but we
  // tint the background a hair lighter so the user can tell the two
  // bars apart at a glance without needing a divider rule.
  secondaryStrip: {
    backgroundColor: "rgba(249,250,251,0.92)",
  },
  calendarWrap: {
    flex: 1,
    minWidth: 0,
  },
  surfaceLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  // Multi-tech rendering picker (Ship 3) — collapsible EdgeTab in the
  // bottom-side corner of the calendar wrap, anchored to the same edge
  // as the AvatarStrip. The handle sits flush against that edge; the
  // panel slides inward when opened, exposing a 2-segment control
  // (Overlap / Mini-cols). Bottom corner was chosen over top-left
  // (Ship 2's chip location) so it can't conflict with the iOS home
  // indicator's swipe-up zone (we still pad above `insets.bottom`) and
  // because the bottom edge of the calendar grid is rarely a drag-end
  // target — minimal risk of fighting drag/scroll handlers.
  tabHandleWrap: {
    zIndex: 100,
  },
  tabHandle: {
    width: 24,
    height: 36,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,24,39,0.85)",
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  tabHandlePressed: {
    backgroundColor: "rgba(17,24,39,0.65)",
  },
  tabPanel: {
    backgroundColor: "rgba(17,24,39,0.92)",
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    padding: 6,
    justifyContent: "center",
    zIndex: 100,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
  },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  segmentPressed: {
    opacity: 0.7,
  },
  segmentText: {
    color: "#D1D5DB",
    fontSize: 11,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  // 2026-05-10 follow-up — Now/Future toggle safety net wrapper. Sits
  // at the top of the calendar wrapper, anchored to whichever edge is
  // OPPOSITE the avatar strip so it never collides with the avatar
  // hit-test or with `MapToggleButton` / `PendingRealityHUD` (which
  // anchor to the avatar-strip-opposite edge but at the BOTTOM).
  // Inline `top` / `left` / `right` overrides at the call site supply
  // the safe-area offset since the value depends on per-render state.
  // `pointerEvents: "box-none"` lets touches outside the inner pill
  // fall through to the calendar canvas (the inner pill's Pressable
  // catches its own touches).
  toggleSafetyNet: {
    position: "absolute",
    zIndex: 95,
  },
});

export const __INTERNAL_FOR_TESTS = {
  aggregateEventsForTech,
  AVATAR_STRIP_WIDTH: LANDSCAPE_AVATAR_STRIP_WIDTH,
};
