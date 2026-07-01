import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
// LDM-WAVE-2 CHUNK-2 (SHEETS-1): every `useRef<…>(null)` for a sheet
// now uses `AppSheetRef` — the type re-exported from
// `@technician/components/sheets` (structurally identical to the underlying
// `@gorhom/bottom-sheet` default export, but the indirection lets the
// `no-restricted-imports` rule block direct gorhom imports app-wide).
//
// The `detailSheetSide` state below still drives the half-vs-full
// decision via the detail-sheet's `side` prop; the detail-sheet
// forwards it as `<AppSheet forceSide={side}>` internally, which is
// the semantic equivalent of the prior inline positioned-wrapper.
// The day-index → `side` math here is identical to what AppSheet's
// `tapX > screenWidth/2 → 'left'` resolver would produce for the
// four workweek columns; we keep the explicit `side` form so the
// portrait + single-day-landscape "full" fallback stays loud rather
// than relying on `defaultSide`.
import { type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import dayjs from "dayjs";

import { useAuthStore } from "@/src/stores/auth";
import { useCalendarStore, type PendingDraft } from "@technician/stores/calendar";
// PLAN-DEVIATION: 2026-04-27-pending-tap-to-detail-sheet — the
// pending-reality tap router (usePendingRealityStore + the
// computePendingChangeOverlay helper) used to live in this file
// to decide whether to push /pending-reality/review on tap. That
// branch was removed; the imports went with it.
import { sheetDraftCacheKey } from "@technician/stores/use-sheet-draft-store";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import {
  useFranchiseDayView,
  useFranchiseWeekView,
  useTechnicianDayView,
  useTechnicianWeekView,
  useReassignAppointment,
  useRescheduleAppointment,
} from "@technician/hooks/schedule/use-calendar";
import {
  useTodayRoute,
  useRouteByDate,
  useArriveAtStop,
  useDepartStop,
} from "@technician/hooks/operations/use-routes";
import { useDailyBriefing, useFranchiseBriefing } from "@technician/hooks/jobs/use-briefing";
import { useCertificationStanding } from "@technician/hooks/training/use-certification";
import { useCurrentLocation } from "@technician/hooks/utility/use-location";
import { haptic } from "@technician/hooks/utility/use-haptics";

import { CalendarHeader } from "@technician/components/calendar/calendar-header";
import { CalendarOverviewBar } from "@technician/components/calendar/calendar-overview-bar";
import { DailyBriefingBanner } from "@technician/components/calendar/DailyBriefingBanner";
import { MonthView } from "@technician/components/calendar/month-view";
import { AppointmentDetailSheet } from "@technician/components/calendar/appointment-detail-sheet";
import { AppointmentFormSheet } from "@technician/components/calendar/appointment-form-sheet";
import { RescheduleSheet } from "@technician/components/calendar/reschedule-sheet";
import { CancelSheet } from "@technician/components/calendar/cancel-sheet";
import { PersonalEventFormSheet } from "@technician/components/calendar/personal-event-form-sheet";
import { QuickTextSheet } from "@technician/components/calendar/quicktext-sheet";
import { GenerateAppointmentSheet } from "@technician/components/calendar/generate-appointment-sheet";
import { FlexListSheet } from "@technician/components/calendar/flex-list-sheet";
import { CalendarQuickSettingsSheet } from "@technician/components/calendar/calendar-quick-settings-sheet";
import { EventTypeChooserSheet } from "@technician/components/calendar/event-type-chooser-sheet";
import { LinterInterceptSheet } from "@technician/components/calendar/linter-intercept-sheet";
import { useCalendarWorldSnapshot } from "@technician/hooks/schedule/use-calendar-world-snapshot";
import { useSessionAwareSubmit } from "@technician/hooks/schedule/use-session-aware-submit";
import { useModifyReorganizationIntent } from "@technician/hooks/schedule/use-reorganization";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";
import {
  isMoveChainGhostEventId,
  intentIdFromGhostEventId,
} from "@technician/components/calendar/move-chain-ghost-tiles";
import {
  buildModifyIntentPayloadForGhostDrag,
  type GhostDragSourceAppointment,
} from "@technician/components/calendar/move-chain-ghost-drag";
import { SwapToast } from "@technician/components/calendar/swap-toast";
import { EventQuickActionToast } from "@technician/components/calendar/event-quick-action-toast";
import { RotateBackToast } from "@technician/components/calendar/rotate-back-toast";
import { CrossCardCollisionToast } from "@technician/components/calendar/cross-card-collision-toast";
import { RouteTimeline } from "@technician/components/route/route-timeline";
import { RouteMapView } from "@technician/components/route/route-map-view";
import { FranchiseRouteMap } from "@technician/components/route/franchise-route-map";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";

import { UserRole } from "@technician/types/enums";
import { Config } from "@technician/constants/config";
import { getDensityHourHeight, isDenseWidth, getBaseDayColumns } from "@technician/constants/calendar";
import type { CalendarAppointmentItem, PersonalEvent } from "@technician/types/calendar";
import { useDeletePersonalEvent, useUpdatePersonalEvent } from "@technician/hooks/schedule/use-personal-events";
import { localToBackendISO } from "@technician/utils/datetime";
import {
  dayDataToLinterAppointments,
  type ChainToChainConflict,
} from "@technician/utils/detect-move-chains";
import { sortTechsByOrder } from "@technician/utils/sort-techs-by-order";
import { padDayDataWithSelectedTechs } from "@technician/utils/pad-day-data-with-selected-techs";
import type { RouteStopWithDetails } from "@technician/types/api";
import {
  ResourceCalendarDayView,
  useDraggedEventDraftSubscription,
} from "@technician/components/calendar/resource-calendar-day-view";
import { ResourceCalendarWorkweekView } from "@technician/components/calendar/resource-calendar-workweek-view";
import { LandscapeWorkweekView } from "@technician/components/calendar/landscape/LandscapeWorkweekView";
// PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
// chain-to-chain conflict toast (PR-UX-16 issues #4 + #5).
import { ChainToChainConflictToast } from "@technician/components/calendar/chain-to-chain-conflict-toast";
// PR-UX-20: auto-promote clean-intent toast. Mounted alongside the
// chain-to-chain conflict toast so both share the calendar tab's
// geometry resolvers but don't overlap (the detection hook's
// system-wide cooldown quiets this one when the user is generating
// conflicts).
import { CleanIntentPromotionToast } from "@technician/components/calendar/clean-intent-promotion-toast";
import { useCalendarDisplayLookups } from "@technician/hooks/schedule/use-calendar-display-lookups";
import { useCalendarTabOrientation } from "@technician/components/calendar/landscape/use-calendar-tab-orientation";
import { FloatingDraftCard, isDraftSyntheticEventId } from "@technician/components/calendar/FloatingDraftCard";
import type { EmbeddedAvatarSelectorTech } from "@technician/components/calendar/embedded-avatar-selector";
import { PendingRealityFAB } from "@technician/components/calendar/PendingRealityFAB";
import { PendingRealityDevShortcut } from "@technician/components/calendar/PendingRealityDevShortcut";
import { NowFutureToggle } from "@technician/components/calendar/NowFutureToggle";
import {
  CollapsibleTopProvider,
  useCollapseProgress,
} from "@technician/components/calendar/CollapsibleTopContext";
import { applyIntentsToWorld } from "@technician/utils/apply-intents-to-world";
import { traceCalendar } from "@technician/utils/sentry-diagnostics";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";
import {
  CalendarBindingProvider,
  type Event as RCEvent,
  type Resource as RCResource,
  type DraggedEventDraft,
} from "react-native-resource-calendar";
import {
  getAppointmentFromEvent,
  getPersonalEventFromEvent,
  isPersonalEvent,
  isDraftEvent,
  minutesToIso,
} from "@technician/utils/resource-calendar-mapping";

type SheetType = "detail" | "form" | "reschedule" | "cancel" | "personal" | "quicktext" | "generate" | "flex" | "quick-settings" | "chooser" | null;

// FORK Phase 28.2-logging companion (P3-FE-DRAG-GHOST follow-up,
// 2026-05-06): consumer-side identifier for the calendar that's
// currently rendered. Used as a `[CAL:${calTag(...)}]` prefix on
// every `[CAL:*]` console.log emitted by THIS file so smoke logs
// from the franchise tab are self-attributing across the three
// `<Calendar>` mounts (DAY-PORTRAIT, WEEK-PORTRAIT, WORKWEEK-
// LANDSCAPE — also the IDs we pass into the vendored Calendar's
// own `calendarId` prop). Landscape wins regardless of viewMode
// because the franchise app re-routes `viewMode === "day"` /
// `"week"` to `<LandscapeWorkweekView>` when the device rotates.
// Mode `"month"` (franchise) and `"route"` (technician) don't mount
// a vendored Calendar; we tag those with the bare viewMode string
// so any stray log still resolves to a recognizable identity.
function calTag(viewMode: string, isLandscape: boolean): string {
  if (isLandscape) return "WORKWEEK-LANDSCAPE";
  if (viewMode === "day") return "DAY-PORTRAIT";
  if (viewMode === "week") return "WEEK-PORTRAIT";
  return viewMode.toUpperCase();
}

function RCDragSubscription({ onDragEnd }: { onDragEnd: (draft: DraggedEventDraft) => void }) {
  useDraggedEventDraftSubscription(onDragEnd);
  return null;
}

// PLAN-DEVIATION: 2026-04-21-rotation-sideways-draft — the previous
// `HeldDraftCapturer` (which bridged the vendored library's drag
// state into a top-level ref so a 30-second rotation snapshot could
// survive the orientation-driven `CalendarBindingProvider` remount)
// is GONE. The pending draft now lives in `useCalendarStore` —
// orientation-resilient by construction — and the on-canvas draft
// block is rendered via synthetic event injection by
// `useResourcesWithDraft` inside each calendar wrapper. See
// docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft.
// PLAN-DEVIATION: 2026-05-07-work-window-matches-display-range —
// docs/PLAN-DEVIATIONS.md#2026-05-07-work-window-matches-display-range
//
// Pre-2026-05-07 these were `330` (05:30) and `1050` (17:30), 30 min
// narrower at each end than the default display range
// `[DEFAULT_DISPLAY_START_MINUTES=300, DEFAULT_DISPLAY_END_MINUTES
// =1080]`. The vendored library's pan-onUpdate snap clamp lets the
// user drag the floating card to the visible grid top/bottom (Phase
// 33 sets `snapMin = scrollY`, `maxAbsoluteTop = layout.height +
// scrollY - eventHeight`), so the worklet hands a `from = 300` /
// `to = 1080` to the consumer when the user drops at the grid edge.
// `clampDragRangeToWorkWindow` (defined just below) then shifted
// the appointment by 30 min to fit the narrower work window —
// silently shaving the first / last 30 min of the visible grid.
//
// User report after Phase 33 on-device pass:
//   "the top and bottom are still cutting out 30min of calendar
//   space from where they are supposed to."
//
// Aligning the work window to the display range eliminates the
// 30-min dead zone at each edge. The constants stay because the
// `clampDragRangeToWorkWindow` helper still needs upper / lower
// bounds for the duration-preserving move math; they're now equal
// to the display defaults instead of a tighter business-hours
// window. If a future requirement re-introduces a tighter business
// window, drive it from `useCalendarStore.getState()
// .displayStartMinutes / .displayEndMinutes` so the work window
// always equals what the user can visually see and drop into.
//
// FORK Phase 34 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY, 2026-05-07).
const RC_WORK_START = 300; // 05:00 (matches DEFAULT_DISPLAY_START_MINUTES)
const RC_WORK_END = 1080; // 18:00 (matches DEFAULT_DISPLAY_END_MINUTES)

// 2026-05-06: duration-preserving clamp into the work window. Replaces a
// per-end clamp pattern that was duplicated 6× in this file and silently
// SHRUNK appointments when the user dropped near the top or bottom edge of
// the canvas — the previous code clamped `from` up to RC_WORK_START while
// leaving `to` untouched (or vice-versa at the bottom), so a 45-min
// appointment dropped 30 min above 5:30 came back as a 15-min commit.
//
// Behavior:
//   - MOVE (input duration === original event duration): the whole block
//     is shifted into the work window, preserving duration. If the event
//     duration is wider than the window itself we fall back to the
//     per-end clamp so the result is still sane (the work window is 12 h,
//     so this branch isn't expected to fire in practice).
//   - RESIZE (input duration ≠ original): the original per-end clamp is
//     preserved so pinch-to-resize still snaps each handle independently.
//
// `originalFrom`/`originalTo` are the event's ORIGINAL from/to (i.e.
// `draft.event.from` / `draft.event.to`), not the dragged from/to.
function clampDragRangeToWorkWindow(
  inputFrom: number,
  inputTo: number,
  originalFrom: number,
  originalTo: number,
): { from: number; to: number } {
  const inputDuration = inputTo - inputFrom;
  const originalDuration = originalTo - originalFrom;
  // Tolerate tiny rounding drift from worklet snap math; anything within
  // 1 minute is considered "same duration" → treat as a move.
  const isMove =
    originalDuration > 0 && Math.abs(inputDuration - originalDuration) < 1;

  if (isMove) {
    let from = inputFrom;
    let to = inputTo;
    if (from < RC_WORK_START) {
      const shift = RC_WORK_START - from;
      from += shift;
      to += shift;
    }
    if (to > RC_WORK_END) {
      const shift = to - RC_WORK_END;
      from -= shift;
      to -= shift;
    }
    if (from < RC_WORK_START || to > RC_WORK_END) {
      // Duration wider than the work window — fall back to per-end clamp.
      from = Math.max(RC_WORK_START, Math.min(inputFrom, RC_WORK_END));
      to = Math.max(from + 5, Math.min(inputTo, RC_WORK_END));
    }
    return { from: Math.round(from), to: Math.round(to) };
  }

  const from = Math.round(
    Math.max(RC_WORK_START, Math.min(inputFrom, RC_WORK_END)),
  );
  const to = Math.round(
    Math.max(from + 5, Math.min(inputTo, RC_WORK_END)),
  );
  return { from, to };
}

function buildDateTime(date: string | null, time: string | null, fallback: string): string {
  if (date && time) return `${date}T${time}`;
  if (date) return `${date}T08:00:00`;
  return fallback;
}

// ── Franchise Owner Calendar ────────────────────────────────────

// `BriefingBadge` and the inline Daily Briefing JSX were extracted
// into `<DailyBriefingBanner>` (PR-UI-REDESIGN-1 modularization,
// 2026-05-12). See `src/components/calendar/DailyBriefingBanner.tsx`.

// Vertical pan + tap on a small grab handle to collapse/expand the
// briefing + overview region, giving the calendar more vertical room.
// Collapse state is session-only.
//
// PR-UX-6 (2026-05-08 follow-up): the `collapseProgress` SV is
// hoisted into `<CollapsibleTopProvider>` so descendants of the FO
// portrait root that aren't in this component's child tree (the
// avatar strip lives below `<CollapsibleTop>` as a sibling, not a
// descendant) can subscribe to the collapse animation via
// `useCollapseProgress()` and re-measure window-coord bboxes when
// the chrome height changes. See
// docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation
// for the full diagnosis. The `dragStartProgress` SV stays local —
// it's a per-gesture scratch, not part of the public contract.
function CollapsibleTop({ children }: { children: ReactNode }) {
  const collapseProgress = useCollapseProgress();
  if (!collapseProgress) {
    throw new Error(
      "<CollapsibleTop> must be mounted inside <CollapsibleTopProvider>",
    );
  }
  const dragStartProgress = useSharedValue(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  // PR-UX-14 (2026-05-09) Issue 4: previously this was a plain
  // `useRef<number>(0)` whose `.current` was both mutated from the
  // JS-thread `onContentLayout` callback AND read from the
  // `collapseGesture.onUpdate` worklet (~30 lines below). Reanimated 4
  // captures any object referenced inside a worklet by closure and
  // freezes it; mutating `.current` afterwards on the JS thread
  // trips the runtime guard:
  //
  //   "[Worklets] Tried to modify key `current` of an object which has
  //    been already passed to a worklet."
  //
  // PR-UX-13's `dev-instrument-worklets-warning.ts` smoke pinned this
  // call site (`app/(tabs)/index.tsx:286:29` in `onContentLayout`)
  // as the offending mutation. The fix is to give the worklet its
  // own `SharedValue<number>` (which Reanimated explicitly supports
  // for cross-thread state) and keep the JS-side ref purely as a
  // dedup-on-tolerance comparator that NEVER appears inside a
  // worklet.
  //
  // Cleanup-if-reverted: the worklet would re-capture the JS ref and
  // the warning would return on the next layout pass that mutates
  // `.current`. See `docs/PLAN-DEVIATIONS.md` if a future task
  // motivates rolling this back.
  const naturalHeightSV = useSharedValue(0);
  const naturalHeightCmpRef = useRef(0);

  const onContentLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h <= 0) return;
    // Track the latest measured content height. Growth handles late-mounting
    // children (e.g. CalendarOverviewBar returns null until dispatch data
    // arrives); shrinkage handles intentional content collapse (e.g. the
    // overview bar's alerts/exceptions panel closing). 1px tolerance avoids
    // floating-point churn from sub-pixel layout passes.
    if (Math.abs(h - naturalHeightCmpRef.current) <= 1) return;
    naturalHeightCmpRef.current = h;
    naturalHeightSV.value = h;
    setNaturalHeight(h);
  }, [naturalHeightSV]);

  const containerStyle = useAnimatedStyle(() => {
    if (naturalHeight === 0) return {};
    return {
      height: interpolate(
        collapseProgress.value,
        [0, 1],
        [naturalHeight, 0],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(
        collapseProgress.value,
        [0, 0.7, 1],
        [1, 0.4, 0],
        Extrapolation.CLAMP,
      ),
    };
  }, [naturalHeight]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(collapseProgress.value, [0, 1], [0, 180])}deg`,
      },
    ],
  }));

  const collapseGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-12, 12])
        .onStart(() => {
          dragStartProgress.value = collapseProgress.value;
        })
        .onUpdate((e) => {
          // PR-UX-14 Issue 4: read the SharedValue, NOT the JS ref
          // (which would re-introduce the Reanimated frozen-ref
          // mutation warning). See the `naturalHeightSV` comment
          // block above for the full rationale.
          if (naturalHeightSV.value === 0) return;
          const delta = -e.translationY / naturalHeightSV.value;
          const next = dragStartProgress.value + delta;
          collapseProgress.value = Math.max(0, Math.min(1, next));
        })
        .onEnd((e) => {
          const v = e.velocityY;
          const p = collapseProgress.value;
          const shouldCollapse = v < -300 || (v <= 300 && p > 0.5);
          collapseProgress.value = withSpring(shouldCollapse ? 1 : 0, {
            damping: 22,
            stiffness: 240,
            mass: 0.6,
          });
        }),
    // PR-UX-14 Issue 4: include `naturalHeightSV` in deps so the
    // worklet captures the stable SV identity. SharedValue identity
    // is stable across renders, so this is functionally a no-op
    // (the gesture is not re-created), but listing it makes the
    // closure dependency explicit and matches the linter's
    // exhaustive-deps expectation.
    [collapseProgress, dragStartProgress, naturalHeightSV],
  );

  const onHandlePress = useCallback(() => {
    haptic.light();
    const target = collapseProgress.value > 0.5 ? 0 : 1;
    collapseProgress.value = withSpring(target, {
      damping: 22,
      stiffness: 240,
      mass: 0.6,
    });
  }, [collapseProgress]);

  return (
    <GestureDetector gesture={collapseGesture}>
      <View>
        <Animated.View style={[{ overflow: "hidden" }, containerStyle]}>
          <View onLayout={onContentLayout}>{children}</View>
        </Animated.View>
        <Pressable
          onPress={onHandlePress}
          hitSlop={{ top: 6, bottom: 12, left: 24, right: 24 }}
          style={styles.collapseHandleRow}
        >
          <View style={styles.collapseHandlePill} />
          <Animated.View style={[styles.collapseHandleChevron, chevronStyle]}>
            <MaterialIcons name="expand-less" size={14} color="#9CA3AF" />
          </Animated.View>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

function FranchiseOwnerCalendar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const franchiseId = user?.franchiseId ?? 0;
  const {
    viewMode,
    selectedDate,
    showMap,
    calendarDensity,
    workweekTechId,
    workweekTechName,
    enterWorkweek,
    exitWorkweek,
    selectedTechIds,
    techOrder,
    toggleCalendarTech,
    setSelectedTechIds,
    setTechOrder,
    pendingAutoSelectFirstTech,
    setPendingAutoSelectFirstTech,
  } = useCalendarStore();

  // P2-FE-4: allow landscape rotation while the calendar tab is
  // focused; lock back to portrait on blur so other tabs (which
  // assume portrait-only chrome) never inherit a landscape lock.
  useCalendarTabOrientation();
  // Landscape canvas branch (master plan §5.1.1). Only the franchise
  // owner gets the landscape workweek today; the tech role still
  // ships portrait-only since it lacks multi-tech overlay semantics.
  const { orientation } = useWideCanvas();
  const isLandscape = orientation === "landscape";

  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const franchiseBriefing = useFranchiseBriefing(franchiseId, today);

  const franchiseBriefingSummary = useMemo(() => {
    const b = franchiseBriefing.data;
    if (!b) return { materialIssueCount: 0, alertCount: 0, subtitle: "Fleet overview, alerts, and today's operations" };
    const materialIssueCount = b.material_shortages?.length ?? 0;
    const alertCount = b.alerts?.length ?? 0;
    const totalIssues = materialIssueCount + alertCount;
    const subtitle = totalIssues > 0
      ? [materialIssueCount > 0 && `${materialIssueCount} part${materialIssueCount !== 1 ? "s" : ""} need attention`, alertCount > 0 && `${alertCount} alert${alertCount !== 1 ? "s" : ""}`].filter(Boolean).join(", ")
      : "All clear — fleet, materials, and alerts";
    return { materialIssueCount, alertCount, subtitle };
  }, [franchiseBriefing.data]);

  const DEFAULT_HOUR_HEIGHT = getDensityHourHeight(calendarDensity);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const [calendarViewportH, setCalendarViewportH] = useState(0);

  useEffect(() => {
    setHourHeight(DEFAULT_HOUR_HEIGHT);
  }, [DEFAULT_HOUR_HEIGHT]);

  const workweekStartDate = useMemo(() => {
    const d = dayjs(selectedDate);
    const dow = d.day();
    const monday = dow === 0 ? d.subtract(6, "day") : d.subtract(dow - 1, "day");
    return monday.format("YYYY-MM-DD");
  }, [selectedDate]);

  // PLAN-DEVIATION: 2026-04-20-landscape-empty-grid-leak — landscape
  // workweek must fetch week data even when `viewMode` is still
  // `"day"` (the user can rotate from portrait day view without us
  // toggling viewMode). Without this gate the LandscapeWorkweekView
  // gets `weekData: undefined`, the StoreFeeder writes nothing, and
  // any stale day-view events left in the (shared) calendar binding
  // store leak into the landscape grid.
  // See docs/PLAN-DEVIATIONS.md#2026-04-20-landscape-empty-grid-leak
  const dayQuery = useFranchiseDayView(
    viewMode === "day" ? selectedDate : ""
  );
  // 2026-05-08: the day-view branch now consumes `weekQuery.data` for
  // chain-graph derivation when there are staged intents (see the
  // `<ResourceCalendarDayView>` mount below — `weekData` prop), so
  // we widen the gate from "viewMode === week || landscape" to also
  // include "any staged intents present" so the day branch has a
  // populated week response to feed the detector. Without this gate
  // the chip row would see only the per-day appointment projection
  // and silently drop chains whose underlying source rows live on
  // other days in the same week — see resource-calendar-day-view.tsx
  // around the `useMoveChainGraph` call for the failure mode this
  // closes.
  const hasStagedIntents = usePendingRealityStore(
    (s) => s.intents.length > 0,
  );
  const weekQuery = useFranchiseWeekView(
    viewMode === "week" || isLandscape || hasStagedIntents
      ? workweekStartDate
      : ""
  );

  // PR-UX-5 (2026-05-08) — Now⇄Future calendar toggle. When
  // `futureMode === true` the calendar canvas renders the projected
  // post-commit world via `applyIntentsToWorld(weekData, intents)`
  // instead of the live BE data. The toggle is gated on
  // `hasStagedIntents` (no point in projecting nothing) and is
  // force-cleared the moment intents go to zero.
  //
  // The chip-row carousel, ghost destination tiles, and arrow
  // overlay all hide themselves when `futureMode === true` (see
  // each calendar wrapper's local `useCalendarStore` read) — the
  // chains are visually collapsed into the cards' actual projected
  // positions, so the move-chain affordances no longer apply.
  //
  // Replaces the (now-cut) "Final state" tab on the Pending Reality
  // review screen — see `docs/PLAN-DEVIATIONS.md
  // #2026-05-08-calendar-now-future-toggle`. The review screen
  // still owns Sequence-of-Operations + Cancel/Finalize.
  const futureMode = useCalendarStore((s) => s.futureMode);
  const setFutureMode = useCalendarStore((s) => s.setFutureMode);
  const reorganizationIntents = usePendingRealityStore((s) => s.intents);
  useEffect(() => {
    if (!hasStagedIntents && futureMode) {
      setFutureMode(false);
    }
  }, [hasStagedIntents, futureMode, setFutureMode]);

  const projectedWeekResult = useMemo(() => {
    if (!futureMode) return null;
    if (!Array.isArray(weekQuery.data)) return null;
    if (reorganizationIntents.length === 0) return null;
    const result = applyIntentsToWorld(weekQuery.data, reorganizationIntents);
    traceCalendar("projectedWeekResult computed", {
      futureMode,
      intentCount: reorganizationIntents.length,
      inputDayCount: weekQuery.data.length,
      outputDayCount: result.days.length,
      offScreenCount: result.offScreen.length,
    });
    return result;
  }, [futureMode, weekQuery.data, reorganizationIntents]);

  const projectedDayResult = useMemo(() => {
    if (!futureMode) return null;
    if (!dayQuery.data) return null;
    if (reorganizationIntents.length === 0) return null;
    const result = applyIntentsToWorld([dayQuery.data], reorganizationIntents);
    const apptCount =
      result.days[0]?.technicians?.reduce(
        (sum, t) => sum + (t.appointments?.length ?? 0),
        0,
      ) ?? 0;
    traceCalendar("projectedDayResult computed", {
      futureMode,
      intentCount: reorganizationIntents.length,
      outputDayCount: result.days.length,
      outputApptCount: apptCount,
      offScreenCount: result.offScreen.length,
    });
    return result;
  }, [futureMode, dayQuery.data, reorganizationIntents]);

  const weekDataForCanvas = projectedWeekResult
    ? projectedWeekResult.days
    : Array.isArray(weekQuery.data)
      ? weekQuery.data
      : undefined;
  const dayDataForCanvasRaw = projectedDayResult
    ? projectedDayResult.days[0]
    : dayQuery.data;
  // PR-UI-REDESIGN-2 (2026-05-12): the `offScreenCount` compute
  // and its forwarding into `<NowFutureToggle offScreenCount={...} />`
  // were removed when the toggle's full-width caption strip was
  // dropped. If a future PR re-introduces an off-screen badge in
  // a different surface, restore the sum here from
  // `projectedWeekResult?.offScreen.length` and
  // `projectedDayResult?.offScreen.length`.

  // 2026-05-09 — Bug A fix: when the BE returns 0 technicians for a
  // date the user has navigated to (e.g. past the seed window after
  // Reset Demo Data), the day view's column count collapses to 0
  // even though the user has 6 techs in their `selectedTechIds`
  // roster. The library divides by the column count for layout
  // (`APPOINTMENT_BLOCK_WIDTH = (width - TIME_LABEL_WIDTH) /
  // numberOfColumns`) and the result is `Infinity`/`NaN` — the grid
  // renders nothing and stays broken until app restart.
  //
  // The store IS the source of truth for "which columns to render";
  // the BE just feeds it appointments. Pad the day-view input so
  // every selected tech has a column, with placeholders for techs
  // the BE didn't return any data for. Names are sourced from
  // whichever recent BE response had them (week query first, day
  // query as fallback). If a tech is selected but no name is
  // anywhere, fall back to a numeric placeholder — the column will
  // still render, the user can still tap appointments back into
  // existence on it, and the next response that includes the tech
  // overrides the placeholder name.
  //
  // Intentionally the OPPOSITE direction of the calendar library's
  // `selectedResourceIds` body filter: that hides UNSELECTED techs
  // from the body while keeping their avatars in the header. We
  // need to ADD selected techs that the BE didn't include. Both
  // mechanisms compose correctly because both consume the same
  // `selectedTechIds` array.
  const techNameLookup = useMemo(() => {
    const m = new Map<number, { name: string; profile_image_url: string | null }>();
    if (Array.isArray(weekQuery.data)) {
      for (const day of weekQuery.data) {
        for (const t of day.technicians ?? []) {
          if (!m.has(t.technician_id)) {
            m.set(t.technician_id, {
              name: t.technician_name,
              profile_image_url: t.profile_image_url,
            });
          }
        }
      }
    }
    for (const t of dayQuery.data?.technicians ?? []) {
      if (!m.has(t.technician_id)) {
        m.set(t.technician_id, {
          name: t.technician_name,
          profile_image_url: t.profile_image_url,
        });
      }
    }
    return m;
  }, [weekQuery.data, dayQuery.data]);

  const dayDataForCanvas = useMemo(
    () =>
      padDayDataWithSelectedTechs(
        dayDataForCanvasRaw,
        selectedTechIds,
        techNameLookup,
      ),
    [dayDataForCanvasRaw, selectedTechIds, techNameLookup],
  );

  // PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups —
  // Linter-shape appointment list for the chain-to-chain conflict
  // toast (mounted near the bottom of this screen). The detector
  // needs the same week-window projection that `useMoveChainGraph`
  // uses inside the calendar wrappers; we project from
  // `weekQuery.data` directly so the toast picks up cross-day
  // conflicts that a per-day projection would miss. Cheap when no
  // intents are staged (the toast's effect early-returns on
  // `intents.length < 2`).
  const chainToChainConflictAppointments = useMemo(
    () =>
      Array.isArray(weekQuery.data)
        ? dayDataToLinterAppointments(weekQuery.data)
        : undefined,
    [weekQuery.data],
  );

  // PR-UX-19 — conflict→x mapping for the chain-to-chain conflict
  // toast. Mirrors the `AppointmentDetailSheet` precedent's
  // `dayIndex < 2 ? "right" : "left"` rule (P2-FE-5 chunk 2c-prep,
  // 2026-04-22; PLAN-DEVIATION 2026-04-22-half-width-detail-sheet)
  // by translating the conflict's calendar geometry into a
  // viewport-X coordinate the toast's `useDynamicPopupSide` hook
  // can split against the viewport midpoint.
  //
  // Why we own this here instead of inside the toast: the X math
  // is view-mode-specific. Landscape workweek uses the conflict's
  // `date` against `workweekStartDate`; portrait day uses the
  // conflict's `technician_id` against the visible tech columns
  // (dayData order, filtered by selectedTechIds). Centralising
  // those two flavors inside the toast would couple it to the
  // calendar layout and break the "this popup pattern is reusable
  // for the next drawer" requirement from the user spec — the
  // upcoming customer-info popup-on-tap will provide its own
  // getConflictX.
  //
  // `null` returns are fine: the toast falls back to a right-side
  // half-width popup so the conflict still doesn't cover the
  // chains the user is looking at. Returning a position is purely
  // a refinement.
  const conflictXResolver = useCallback(
    (conflict: ChainToChainConflict, viewportWidth: number): number | null => {
      if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
      // Landscape workweek branch: 4-day window from
      // `workweekStartDate`. Mirror the precedent exactly so a
      // conflict and a tap on the SAME slot land the popup on the
      // SAME side.
      if (isLandscape && conflict.date) {
        const dayIndex = dayjs(conflict.date).diff(workweekStartDate, "day");
        if (dayIndex >= 0 && dayIndex < 4) {
          // Center of the day's column. The vendored library reserves
          // a 50pt time-label gutter (`TIME_LABEL_WIDTH`) on the
          // leading edge — close enough to ignore for a "which half
          // of the screen?" coarse split, but we still bias the X
          // into the column's mid-point so a 4-column grid maps
          // cleanly to the 50/50 viewport split.
          return ((dayIndex + 0.5) / 4) * viewportWidth;
        }
        return null;
      }
      // Portrait day-view branch: techs are columns. Use
      // `dayDataForCanvasRaw`'s tech order (which already reflects
      // `techOrder` + `selectedTechIds`) to find the conflict
      // tech's column index. Falling through to `null` when the
      // tech isn't currently visible is the right behavior — the
      // user can't see the conflict either, so the half-screen
      // pinning has no anchor and the right-side fallback applies.
      const techsInOrder = dayDataForCanvasRaw?.technicians ?? [];
      if (techsInOrder.length === 0) return null;
      const colIndex = techsInOrder.findIndex(
        (t) => t.technician_id === conflict.technician_id,
      );
      if (colIndex < 0) return null;
      return ((colIndex + 0.5) / techsInOrder.length) * viewportWidth;
    },
    [isLandscape, workweekStartDate, dayDataForCanvasRaw],
  );

  // PR-UX-20: clean-intent toast positioner. Maps an intent's
  // destination to viewport X using the same axis the conflict
  // resolver above uses — landscape feeds the destination's
  // `new_scheduled_date` (or the source appointment's date) into
  // the 4-day window; portrait day-view feeds the destination's
  // `new_technician_id` (or the source tech) into the visible
  // tech-column index. `null` returns let the toast fall back to a
  // right-side popup, same contract as the conflict toast.
  const cleanIntentDestXResolver = useCallback(
    (
      intent: import("@technician/types/reorganization").ReorganizationIntent,
      viewportWidth: number,
    ): number | null => {
      if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
      const sourceAppt =
        intent.appointment_id != null
          ? chainToChainConflictAppointments?.find(
              (a) => a.id === intent.appointment_id,
            ) ?? null
          : null;
      const destDate =
        intent.payload.kind === "reschedule"
          ? intent.payload.new_scheduled_date
          : sourceAppt?.scheduled_date ?? null;
      const destTech =
        intent.payload.kind === "reschedule"
          ? intent.payload.new_technician_id ?? sourceAppt?.technician_id ?? null
          : intent.payload.kind === "reassign"
            ? intent.payload.new_technician_id
            : sourceAppt?.technician_id ?? null;
      if (isLandscape && destDate) {
        const dayIndex = dayjs(destDate).diff(workweekStartDate, "day");
        if (dayIndex >= 0 && dayIndex < 4) {
          return ((dayIndex + 0.5) / 4) * viewportWidth;
        }
        return null;
      }
      const techsInOrder = dayDataForCanvasRaw?.technicians ?? [];
      if (techsInOrder.length === 0 || destTech == null) return null;
      const colIndex = techsInOrder.findIndex(
        (t) => t.technician_id === destTech,
      );
      if (colIndex < 0) return null;
      return ((colIndex + 0.5) / techsInOrder.length) * viewportWidth;
    },
    [
      isLandscape,
      workweekStartDate,
      dayDataForCanvasRaw,
      chainToChainConflictAppointments,
    ],
  );

  // PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width — X
  // resolver for the migrated `LinterInterceptSheet`. Mirrors the
  // `conflictXResolver` / `cleanIntentDestXResolver` shape: pick a
  // representative appointment id from the active intercept request
  // (preferring the producer's `scopeAppointmentIds` hint for the
  // dragged card; falling back to the first issue's first affected
  // appointment), look up its date/tech in the same
  // `chainToChainConflictAppointments` projection the conflict
  // resolver uses, and map to viewport X. Returning `null` falls
  // the popup back to a right-side default (still half-width). See
  // docs/PLAN-DEVIATIONS.md#2026-05-10-linter-intercept-half-width.
  const linterInterceptXResolver = useCallback(
    (
      request: import("@technician/stores/linter-intercept-host").LinterInterceptRequest,
      viewportWidth: number,
    ): number | null => {
      if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
      // 2026-05-10 user fix: previously this preferred
      // `scopeAppointmentIds` (the dragged card + its chain), which
      // pinned the popup OPPOSITE the SOURCE position the card came
      // from. The user reported: "they were popping up the opposite
      // from where the starting card was selected, rather than
      // wherever the card is placed, which is where it should
      // register for the popup." Fix: anchor on the
      // DESTINATION-region appointments — the affected committed
      // appointments minus the scope (dragged card + chain). Those
      // sit at the slot the dragged card landed in, so the
      // half-width popup pins to the OPPOSITE half from where the
      // user just dropped, leaving the destination tile visible.
      //
      // Scope-only fallback (when every affected id IS in scope —
      // happens when the linter rule fires on a purely-pending
      // chain conflict with no committed appointment involved) is
      // still useful for portrait single-tech views where there's
      // only one column and source ≡ destination from a half-screen
      // perspective anyway.
      const scopeSet = request.scopeAppointmentIds ?? null;
      const destSideIds: number[] = [];
      for (const issue of request.issues) {
        for (const id of issue.affectedAppointmentIds) {
          if (scopeSet?.has(id)) continue;
          destSideIds.push(id);
        }
      }
      let anchorId: number | null = null;
      if (destSideIds.length > 0) {
        anchorId = Math.min(...destSideIds);
      } else if (scopeSet && scopeSet.size > 0) {
        anchorId = Math.min(...scopeSet);
      } else {
        for (const issue of request.issues) {
          const ids = issue.affectedAppointmentIds;
          if (ids.length > 0) {
            anchorId = ids[0] ?? null;
            break;
          }
        }
      }
      if (anchorId == null) return null;
      const anchorAppt = chainToChainConflictAppointments?.find(
        (a) => a.id === anchorId,
      ) ?? null;
      if (!anchorAppt) return null;
      if (isLandscape && anchorAppt.scheduled_date) {
        const dayIndex = dayjs(anchorAppt.scheduled_date).diff(
          workweekStartDate,
          "day",
        );
        if (dayIndex >= 0 && dayIndex < 4) {
          return ((dayIndex + 0.5) / 4) * viewportWidth;
        }
        return null;
      }
      const techsInOrder = dayDataForCanvasRaw?.technicians ?? [];
      if (techsInOrder.length === 0 || anchorAppt.technician_id == null) {
        return null;
      }
      const colIndex = techsInOrder.findIndex(
        (t) => t.technician_id === anchorAppt.technician_id,
      );
      if (colIndex < 0) return null;
      return ((colIndex + 0.5) / techsInOrder.length) * viewportWidth;
    },
    [
      isLandscape,
      workweekStartDate,
      dayDataForCanvasRaw,
      chainToChainConflictAppointments,
    ],
  );

  // PR-UX-20: post-Apply Undo / world snapshot for the clean-intent
  // toast. Same source the drag handler consumes.
  const cleanIntentWorldSnapshot = useCalendarWorldSnapshot();
  // PR-UX-20: tech-name lookup for the post-apply "Applied [tech]'s
  // [time] move" copy. Reuses the existing display-lookups hook.
  const cleanIntentDisplayLookups = useCalendarDisplayLookups();

  // D2P-FE-14 — one-shot post-reset auto-selection. The FO
  // `selectedTechIds` is session-only and starts empty by design
  // (see `src/stores/calendar.ts` partialize). On a fresh demo seed
  // that means the calendar grid lands empty even though the metric
  // pills above it populate. The reset handlers in
  // `app/(tabs)/more.tsx` set `pendingAutoSelectFirstTech` to true;
  // here, the first time day-view OR week-view data arrives with a
  // non-empty roster while the current selection is missing or
  // stale, we auto-select the first tech and clear the flag.
  //
  // Why we gate on `!isFetching`: the reset handler fires
  // `queryClient.invalidateQueries()` immediately before flipping
  // the flag. While the in-flight refetch lands, the cache still
  // holds the stale pre-reset snapshot; if we picked a
  // `technician_id` off that snapshot we could land on an ID the
  // new seed doesn't recreate, and the grid would render with a
  // "selected" tech that doesn't exist in the new roster — at
  // which point the consumer reads the selection as a no-op and
  // shows nothing. Waiting for fresh data sidesteps that race.
  //
  // Why we re-validate the existing selection: a previously-
  // selected ID may not exist in the new roster after a wipe-and-
  // reseed. If the current `selectedTechIds` doesn't intersect the
  // fresh roster, we treat it as "empty" and pick the first.
  //
  // Scoped to the post-reset flow only — the cold-start behavior
  // (empty grid until the user taps an avatar) is unchanged outside
  // of this branch, per the 2026-04-27 user direction "leave
  // everything else the same since it only seems to happen on
  // fresh seeds."
  useEffect(() => {
    if (!pendingAutoSelectFirstTech) return;
    if (dayQuery.isFetching || weekQuery.isFetching) return;
    const dayTechs = dayQuery.data?.technicians ?? [];
    const weekTechs = weekQuery.data?.[0]?.technicians ?? [];
    const roster = dayTechs.length > 0 ? dayTechs : weekTechs;
    if (roster.length === 0) return;
    const validIds = new Set(roster.map((t) => t.technician_id));
    const hasValidSelection =
      selectedTechIds.length > 0 &&
      selectedTechIds.every((id) => validIds.has(id));
    if (hasValidSelection) {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:reset] post-seed flag clear (selection still valid)");
      setPendingAutoSelectFirstTech(false);
      return;
    }
    const firstId = roster[0].technician_id;
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:reset] auto-selecting first tech post-seed", {
      firstId,
      rosterSize: roster.length,
      hadStaleSelection: selectedTechIds.length > 0,
    });
    setSelectedTechIds([firstId]);
    setPendingAutoSelectFirstTech(false);
  }, [
    pendingAutoSelectFirstTech,
    selectedTechIds,
    dayQuery.data,
    dayQuery.isFetching,
    weekQuery.data,
    weekQuery.isFetching,
    setSelectedTechIds,
    setPendingAutoSelectFirstTech,
  ]);

  // 2026-05-09 — Bug A fix: source the column count from
  // `dayDataForCanvas.technicians` (which now includes placeholder
  // columns for `selectedTechIds` the BE didn't return) instead of
  // the raw BE response. Without this, the day-view's parent column
  // count stayed at 0 even after the day-view itself rendered
  // placeholder columns, and the layout-params math in the vendored
  // calendar (`numberOfColumns: 0` → `totalW: NaN`) blanked the grid.
  const dayResourceCount = dayDataForCanvas?.technicians?.length ?? 0;
  const baseDayColumns = Math.min(
    getBaseDayColumns(calendarDensity),
    dayResourceCount > 0 ? dayResourceCount : 3,
  );

  const effectiveColumns = useMemo(() => {
    if (isDenseWidth(calendarDensity)) return dayResourceCount;
    const raw = baseDayColumns * DEFAULT_HOUR_HEIGHT / hourHeight;
    const cols = Math.min(dayResourceCount, Math.max(baseDayColumns, Math.round(raw)));
    return cols;
  }, [hourHeight, dayResourceCount, calendarDensity, baseDayColumns, DEFAULT_HOUR_HEIGHT]);

  const minHourHeight = useMemo(() => {
    const VISIBLE_HOURS = 13; // 5 AM – 6 PM
    const viewportFloor = calendarViewportH > 0 ? Math.max(20, Math.ceil(calendarViewportH / VISIBLE_HOURS)) : 20;
    const allColumnsH = dayResourceCount > baseDayColumns
      ? Math.ceil(baseDayColumns * DEFAULT_HOUR_HEIGHT / dayResourceCount)
      : viewportFloor;
    const min = Math.max(viewportFloor, allColumnsH);
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:zoomBounds]", { viewportFloor, allColumnsH, min, dayResourceCount, viewportH: Math.round(calendarViewportH) });
    return min;
  }, [calendarViewportH, dayResourceCount, baseDayColumns, DEFAULT_HOUR_HEIGHT]);

  useEffect(() => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:columns]", { effectiveColumns, dayResourceCount, hourHeight, zoomRatio: (hourHeight / DEFAULT_HOUR_HEIGHT).toFixed(2) });
  }, [effectiveColumns, dayResourceCount, hourHeight]);

  const handleZoom = useCallback((newHeight: number) => {
    const clamped = Math.max(minHourHeight, Math.min(DEFAULT_HOUR_HEIGHT, Math.round(newHeight)));
    if (clamped !== hourHeight) {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:zoom]", { raw: newHeight, clamped, prev: hourHeight, min: minHourHeight, max: DEFAULT_HOUR_HEIGHT });
      setHourHeight(clamped);
    }
  }, [hourHeight, minHourHeight]);

  const handleCalendarLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== calendarViewportH) {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:layout] calendar viewport height", h, "-> minHourHeight", Math.max(20, Math.ceil(h / 13)));
      setCalendarViewportH(h);
    }
  }, [calendarViewportH]);

  const availableWorkweekTechs = useMemo(() => {
    const resolveAvatar = (url: string | null | undefined) => {
      if (!url) return undefined;
      if (/^https?:\/\//i.test(url)) return url;
      return `${Config.API_BASE_URL}${url}`;
    };
    const sourceList = (() => {
      if (Array.isArray(weekQuery.data) && weekQuery.data.length > 0) {
        const seen = new Map<number, { id: number; name: string; profileImageUrl?: string | null }>();
        for (const day of weekQuery.data) {
          for (const t of day.technicians ?? []) {
            if (!seen.has(t.technician_id)) {
              seen.set(t.technician_id, {
                id: t.technician_id,
                name: t.technician_name,
                profileImageUrl: resolveAvatar(t.profile_image_url),
              });
            }
          }
        }
        return Array.from(seen.values());
      }
      return (dayQuery.data?.technicians ?? []).map((t) => ({
        id: t.technician_id,
        name: t.technician_name,
        profileImageUrl: resolveAvatar(t.profile_image_url),
      }));
    })();
    // Same sort the day-view's `mapDayResponseToResources` uses, via
    // the shared helper, so reordering an avatar in day-view
    // propagates to the workweek + landscape consumers (which all
    // read this list). See `src/utils/sort-techs-by-order.ts`.
    return sortTechsByOrder(sourceList, techOrder);
  }, [weekQuery.data, dayQuery.data, techOrder]);

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const sheetRef = useRef<AppSheetRef>(null);
  const [activeAppt, setActiveAppt] = useState<CalendarAppointmentItem | null>(null);
  // P2-FE-5 chunk 2c-prep (2026-04-22): detail sheet side for the
  // landscape workweek view — sheet floats half-width on the side
  // *opposite* to the tapped event so the source row stays visible.
  // Defaults to "full" everywhere else (portrait, single-tech day,
  // and any non-detail sheet). See PLAN-DEVIATIONS#2026-04-22-half-width-detail-sheet.
  const [detailSheetSide, setDetailSheetSide] = useState<"left" | "right" | "full">("full");
  const [rescheduleData, setRescheduleData] = useState<{ newStart?: string; newEnd?: string; newTechId?: number; newTechName?: string }>({});
  const [newSheetMode, setNewSheetMode] = useState(false);
  const [newApptDefaults, setNewApptDefaults] = useState<{ date?: string; startTime?: string; technicianId?: number }>({});
  // 2026-04-21: tapping a personal event opens the form sheet in EDIT
  // mode. Stash the tapped event here so the same `<PersonalEventFormSheet>`
  // instance that handles the create flow can also prefill from a
  // backend-fetched event. Cleared in `closeSheet` so the next tap
  // doesn't resurrect a stale event.
  const [editingPersonalEvent, setEditingPersonalEvent] = useState<PersonalEvent | null>(null);
  const lastHandledDragRef = useRef<{ sig: string; ts: number } | null>(null);

  // P2-FE-5 (course-corrected 2026-04-21): pull the pending-draft
  // store actions into closure-stable callbacks. The draft state
  // itself is read by `FloatingDraftCard` and `useResourcesWithDraft`
  // — this branch only writes (tap → create, drag → update, chooser
  // → form launch).
  const createPendingDraft = useCalendarStore((s) => s.createDraft);
  const updatePendingDraft = useCalendarStore((s) => s.updateDraft);
  const dismissPendingDraft = useCalendarStore((s) => s.dismissDraft);
  const setDraftChooserOpen = useCalendarStore((s) => s.setDraftChooserOpen);
  const setDraftTechnicianAction = useCalendarStore((s) => s.setDraftTechnician);
  const setSelectedTechIdsAction = useCalendarStore((s) => s.setSelectedTechIds);
  // P3-FE-6: subscribe to `pendingDraft.draftId` so each form-sheet
  // mount gets a stable cache key for the in-flight RHF values.
  // Reading `.draftId` (a primitive) keeps the selector
  // referentially stable when only the draft's geometry mutates.
  const pendingDraftId = useCalendarStore(
    (s) => s.pendingDraft?.draftId ?? null,
  );

  const reassign = useReassignAppointment();
  const reschedule = useRescheduleAppointment();
  // PR-UX-2 PASS 2.8 task `c7` — ghost-drag → modify_intent. Wired
  // here (alongside reassign/reschedule) so the drag-end handler
  // can route a ghost drop to the underlying intent's destination
  // payload via PATCH /reorganizations/:id (op: "modify_intent")
  // without going through `useSessionAwareSubmit` (which exists to
  // STAGE new intents, not modify existing ones).
  const modifyChainIntent = useModifyReorganizationIntent();

  // ── P3-FE-7 — drag-callsite linter intercept ──────────────────
  // The drag-end handler historically called `reschedule.mutate(...)`
  // / `reassign.mutate(...)` directly. Wrapping each in
  // `useSessionAwareSubmit` runs the local linter on the proposed
  // change first; on a clean result the live mutation fires (matches
  // today's optimistic-commit-with-undo behavior); on an issue, the
  // canvas card snaps back to its pre-drag position (because the
  // optimistic update never runs) and the `LinterInterceptSheet`
  // opens. "Apply anyway" re-runs the live mutation; "Stage" stages
  // the intent without ever moving the card on the canvas.
  // See master plan §5.3.7 + docs/PLAN-DEVIATIONS.md
  // #2026-04-23-smart-default-intent-producer.
  const dragWorldSnapshot = useCalendarWorldSnapshot();
  // 2026-05-08 (post-on-device smoke, this branch): UNFILTERED
  // appointments for the chain-extension gate inside
  // `useSessionAwareSubmit`. Different shape from `dragWorldSnapshot`:
  // the world snapshot strips appointments that have an active intent
  // (so the linter doesn't double-count source slots), but the chain
  // detector NEEDS those source slots to detect trigger edges between
  // a fresh drop and existing staged intents. Source the data from
  // `weekQuery.data` (the same week window the chip row +
  // `useMoveChainGraph` consume) so "what the gate calls a chain"
  // matches "what the user sees on screen" by construction.
  const dragChainAppointments = useMemo(
    () =>
      dayDataToLinterAppointments(
        Array.isArray(weekQuery.data) ? weekQuery.data : undefined,
      ),
    [weekQuery.data],
  );
  type DragRescheduleInput = {
    appointmentId: number;
    newStart: string;
    newEnd: string;
    newTechId: number | undefined;
    newDateYmd: string;
    newStartHHmm: string;
    newEndHHmm: string;
    afterCommit: () => void;
  };
  const buildDragRescheduleIntent = useCallback(
    (input: DragRescheduleInput): ReorganizationIntentPayload => ({
      kind: "reschedule",
      new_scheduled_date: input.newDateYmd,
      new_start_time: input.newStartHHmm,
      new_end_time: input.newEndHHmm,
      ...(typeof input.newTechId === "number" ? { new_technician_id: input.newTechId } : {}),
    }),
    [],
  );
  const dragLiveReschedule = useCallback(
    async (input: DragRescheduleInput) => {
      await reschedule.mutateAsync({
        id: input.appointmentId,
        payload: {
          new_start_time: input.newStart,
          new_end_time: input.newEnd,
          new_technician_id: input.newTechId,
          notification_preference: "email_and_text",
        },
      });
      input.afterCommit();
    },
    [reschedule],
  );
  const dragRescheduleSubmit = useSessionAwareSubmit<DragRescheduleInput>({
    buildProposedIntent: buildDragRescheduleIntent,
    liveMutate: dragLiveReschedule,
    worldSnapshot: dragWorldSnapshot,
    // 2026-05-08 (cascade-real, this branch): the linter's
    // `lintTimeConflicts` skips reschedule intents whose
    // `appointment_id` is `null` (`projectIntentsToTechSlots` in
    // `src/utils/logistics-linter.ts`), so without this the linter
    // never sees the proposed move and overlap-with-existing-card
    // never fires the intercept. Passing a function form (instead of
    // a static value) is required because each drop targets a
    // different appointment.
    targetAppointmentId: (input) => input.appointmentId,
    // 2026-05-08 (post-on-device smoke, this branch): gate the
    // session-sticky branch on chain-extension so no-conflict drops
    // that don't extend an existing chain live-commit instead of
    // staging into the active reorganization session. See
    // `useSessionAwareSubmit`'s `chainAppointments` doc-block for
    // the full rule.
    chainAppointments: dragChainAppointments,
    source: "drag",
  });

  type DragReassignInput = {
    appointmentId: number;
    fromTechId: number;
    toTechId: number;
    afterCommit: () => void;
  };
  const buildDragReassignIntent = useCallback(
    (input: DragReassignInput): ReorganizationIntentPayload => ({
      kind: "reassign",
      new_technician_id: input.toTechId,
    }),
    [],
  );
  const dragLiveReassign = useCallback(
    async (input: DragReassignInput) => {
      await reassign.mutateAsync({
        appointmentId: input.appointmentId,
        fromTechnicianId: input.fromTechId,
        toTechnicianId: input.toTechId,
        // 2026-05-07 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY Task D,
        // re-applied after revert): backend validator requires
        // franchiseId in body — see the `ReassignPayload` interface
        // comment in `src/hooks/schedule/use-calendar.ts`.
        franchiseId,
      });
      input.afterCommit();
    },
    [reassign, franchiseId],
  );
  const dragReassignSubmit = useSessionAwareSubmit<DragReassignInput>({
    buildProposedIntent: buildDragReassignIntent,
    liveMutate: dragLiveReassign,
    worldSnapshot: dragWorldSnapshot,
    // Same reasoning as `dragRescheduleSubmit` above —
    // `projectIntentsToTechSlots` also skips reassign intents with
    // `appointment_id === null`, so quick-swap and avatar-drop reassigns
    // would otherwise run linter-blind.
    targetAppointmentId: (input) => input.appointmentId,
    // Same chain-extension gate as `dragRescheduleSubmit`.
    chainAppointments: dragChainAppointments,
    source: "drag",
  });

  // P2-FE-6 follow-on (2026-04-22): "commit + undo" toast.
  //
  // Generalised from the original SwapToast (cross-tech same-time
  // reassign undo) to cover ALL drag-end commits — same-day,
  // cross-day, time change, tech change, or any combination.
  // The visual component (`SwapToast`) is already generic; only this
  // state shape needed to grow.
  //
  // PLAN-DEVIATION: 2026-04-22-drop-commit-with-undo — see
  // docs/PLAN-DEVIATIONS.md for full rationale (tl;dr: the dwell
  // pattern's 1.15s buzz sequence IS the deliberate-action
  // checkpoint, so the post-drop reschedule sheet was
  // double-confirming the same intent and breaking flow).
  //
  // The discriminated `inverse` is what `undoCommit` fires to roll
  // the change back. `reassign` for tech-only changes (cheaper, no
  // notification re-fire), `reschedule` for any change involving
  // date / time (or tech + date / time combo).
  type CommitToastState = {
    message: string;
    detail?: string;
    inverse:
      | {
          kind: "reassign";
          appointmentId: number;
          fromTechId: number;
          toTechId: number;
        }
      | {
          kind: "reschedule";
          appointmentId: number;
          priorStartIso: string;
          priorEndIso: string;
          priorTechId: number | undefined;
        };
    /**
     * P2-FE-6 follow-on (2026-04-22): optional "Edit details"
     * escape hatch payload. When present, the SwapToast renders an
     * Edit pill that opens the Reschedule sheet pre-filled with
     * these post-commit values so the user can fine-tune time / date
     * / tech without having to long-press the appointment afterward.
     *
     * Omitted for quick-action flows that don't logically lead to a
     * Reschedule sheet (currently: none — both reassign and
     * reschedule commits include this).
     */
    editContext?: {
      appointment: CalendarAppointmentItem;
      currentStartIso: string;
      currentEndIso: string;
      currentTechId: number | undefined;
      currentTechName: string | undefined;
    };
  };
  const [swapToast, setSwapToast] = useState<CommitToastState | null>(null);
  const dismissSwapToast = useCallback(() => setSwapToast(null), []);
  const undoSwap = useCallback(() => {
    if (!swapToast) return;
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:swap] undo", swapToast);
    const inv = swapToast.inverse;

    // Navigation rule (P2-FE-6 follow-on, 2026-04-22): after an
    // undo, navigate the calendar to show the tech the card is
    // being moved BACK to — but only if that tech isn't already
    // visible. Without this, a hover-dwell drop → undo leaves the
    // user staring at the (now empty) destination tech's calendar
    // while their card has silently moved back to a tech that's
    // off-screen. The "already visible" guard preserves the
    // quick-swap fast path's behaviour (both techs are in the
    // selection by definition there, so no surprise narrow).
    //
    // PR 2.2 (2026-04-24) — landscape drag-undo fix: previously this
    // called `setSelectedTechIds([undoDestTechId])` which narrowed
    // the selection to a SINGLE tech. In multi-tech landscape that
    // destructively collapsed the user's whole-day view back to one
    // column — visible symptom: "undo doesn't work right" because
    // the card returned correctly but the calendar layout flipped
    // out from under them. Fix: APPEND undoDestTechId to the
    // existing selection instead of replacing. Empty-mode landscape
    // is unreachable here (drag is disabled there) so we don't
    // need to special-case it.
    const undoDestTechId =
      inv.kind === "reassign" ? inv.fromTechId : inv.priorTechId;
    if (
      typeof undoDestTechId === "number" &&
      !selectedTechIds.includes(undoDestTechId)
    ) {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:swap] undo append dest tech to selection", {
        undoDestTechId,
        prevSelection: selectedTechIds,
        nextSelection: [...selectedTechIds, undoDestTechId],
      });
      setSelectedTechIds([...selectedTechIds, undoDestTechId]);
    }

    if (inv.kind === "reassign") {
      reassign.mutate({
        appointmentId: inv.appointmentId,
        fromTechnicianId: inv.toTechId,
        toTechnicianId: inv.fromTechId,
        // 2026-05-07 (P3-FE-DRAG-EDGES-X-EDGE-REACHABILITY Task D,
        // re-applied after revert): backend validator requires
        // franchiseId in body — see the `ReassignPayload` interface
        // comment in `src/hooks/schedule/use-calendar.ts`. Undo path
        // uses the same active franchise as the original commit (the
        // FO is always single-franchise per session).
        franchiseId,
      });
      return;
    }
    // kind === "reschedule" — restore prior start/end (and tech, if
    // it was part of the original commit). Default
    // `notification_preference` matches the reschedule sheet's
    // historical default ("email_and_text") so the customer sees a
    // single coherent "moved back" notification, mirroring the
    // existing per-commit notification policy. Phase 6 (BE-G15)
    // will batch this transparently at the session level.
    reschedule.mutate({
      id: inv.appointmentId,
      payload: {
        new_start_time: inv.priorStartIso,
        new_end_time: inv.priorEndIso,
        new_technician_id: inv.priorTechId,
        notification_preference: "email_and_text",
      },
    });
  }, [reassign, reschedule, selectedTechIds, setSelectedTechIds, swapToast, franchiseId]);

  // P2-FE-5 chunk 2c (2026-04-22): quick-action toast that lands the
  // long-press router from chunk 2b. Visual model is `SwapToast`
  // (per the user: "use that as a module template"); semantically
  // this is a fast path to the existing `CancelSheet` (real
  // appointments) or `useDeletePersonalEvent` mutation (personal
  // events). Mutually exclusive with `swapToast` so the two
  // bottom-anchored toasts never collide — opening one clears the
  // other (handled at the call sites).
  //
  // 2026-04-22 chunk-2c follow-up: extended to personal events per
  // user feedback ("personal event needs to behave the same way").
  // The discriminated union below lets the same toast component
  // power both Cancel-appointment and Delete-personal-event flows
  // while keeping the action wiring out of the toast itself.
  type QuickActionToastState =
    | { kind: "appointment"; appointment: CalendarAppointmentItem; message: string; detail?: string }
    | { kind: "personalEvent"; personalEvent: PersonalEvent; message: string; detail?: string };
  const [quickActionToast, setQuickActionToast] = useState<QuickActionToastState | null>(null);
  const dismissQuickActionToast = useCallback(() => setQuickActionToast(null), []);

  const deletePersonalEventMutation = useDeletePersonalEvent();
  const updatePersonalEventMutation = useUpdatePersonalEvent();

  const trySnapSheetOpen = useCallback((attempt = 0) => {
    const hasRef = !!sheetRef.current;
    if (sheetRef.current) {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:sheet] snapToIndex(0) attempt", attempt);
      sheetRef.current.snapToIndex(0);
      return;
    }
    if (attempt >= 24) {
      console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:sheet] gave up snapping after 24 attempts");
      return;
    }
    setTimeout(() => trySnapSheetOpen(attempt + 1), 40);
  }, []);

  const openSheet = useCallback((type: SheetType, appt?: CalendarAppointmentItem | null) => {
    if (__DEV__) {
      console.log("[DEBUG:Sheet] open", {
        sheet: type,
        appointmentId: appt?.id ?? null,
        customer: appt?.customer_name ?? null,
        previous: activeSheet ?? null,
      });
    }
    if (appt !== undefined) setActiveAppt(appt ?? null);
    setActiveSheet(type);
    setTimeout(() => trySnapSheetOpen(0), 0);
  }, [trySnapSheetOpen, activeSheet]);

  useEffect(() => {
    if (!activeSheet) return;
    if (__DEV__) {
      console.log("[DEBUG:Sheet] snap (state changed)", { sheet: activeSheet });
    }
    setTimeout(() => trySnapSheetOpen(0), 50);
  }, [activeSheet, trySnapSheetOpen]);

  const closeSheet = useCallback(() => {
    if (__DEV__) {
      console.log("[DEBUG:Sheet] close", { sheet: activeSheet ?? null });
    }
    sheetRef.current?.close();
    setDetailSheetSide("full");
    setTimeout(() => {
      setActiveSheet(null);
      setNewSheetMode(false);
      setNewApptDefaults({});
      setEditingPersonalEvent(null);
    }, 200);
  }, [activeSheet]);

  /**
   * P2-FE-6 follow-on (2026-04-22): Edit-details escape hatch. Fires
   * when the user taps the SwapToast's "Edit" pill. Opens the
   * Reschedule sheet pre-filled with the just-committed values so
   * the user can fine-tune without having to long-press the
   * appointment afterwards.
   *
   * Defined below `openSheet` / `setRescheduleData` so both are in
   * scope. The toast self-dismisses after this callback (see
   * SwapToast's onEdit contract), so we don't manually dismiss here.
   */
  const editCommitFromToast = useCallback(() => {
    if (!swapToast?.editContext) return;
    const ctx = swapToast.editContext;
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:swap] edit", { apptId: ctx.appointment.id });
    setRescheduleData({
      newStart: ctx.currentStartIso,
      newEnd: ctx.currentEndIso,
      newTechId: ctx.currentTechId,
      newTechName: ctx.currentTechName,
    });
    setActiveAppt(ctx.appointment);
    setTimeout(() => openSheet("reschedule", ctx.appointment), 250);
  }, [swapToast, openSheet]);

  // P2-FE-5 chunk 2c: action pill handlers. Real-appointment path
  // routes into the existing CancelSheet (with the standard 250 ms
  // sheet-settle delay used everywhere else in this file). Personal-
  // event path goes straight to the delete mutation — there's no
  // intermediate sheet because deletion has no extra fields to
  // collect (unlike Cancel, which collects a reason).
  //
  // 2026-04-22 follow-up: personal-event branch added per "personal
  // event needs to behave the same way" feedback. Behavior parity
  // with the cancel flow: toast disappears optimistically; backend
  // failure shows up via the normal mutation error toast (handled
  // inside the hook), no extra UI here.
  const handleQuickActionAppointmentCancel = useCallback((appt: CalendarAppointmentItem) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:quickAction] appointment cancel pressed", { id: appt.id });
    setQuickActionToast(null);
    closeSheet();
    setTimeout(() => openSheet("cancel", appt), 250);
  }, [closeSheet, openSheet]);

  const handleQuickActionPersonalDelete = useCallback((pe: PersonalEvent) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:quickAction] personal event delete pressed", { id: pe.id, title: pe.title });
    setQuickActionToast(null);
    deletePersonalEventMutation.mutate(pe.id);
  }, [deletePersonalEventMutation]);

  // PR 2.6 (2026-04-24) — secondary quick-action handlers wired
  // into `EventQuickActionToast.secondaryActions`. Edit routes the
  // user into the appointment form sheet (mirrors the existing
  // detail-sheet "Edit" pill); Quicktext opens the QuickText sheet
  // pre-bound to the appointment's customer.
  const handleQuickActionAppointmentEdit = useCallback((appt: CalendarAppointmentItem) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:quickAction] appointment edit pressed", { id: appt.id });
    setQuickActionToast(null);
    closeSheet();
    setTimeout(() => openSheet("form", appt), 250);
  }, [closeSheet, openSheet]);

  const handleQuickActionAppointmentQuicktext = useCallback((appt: CalendarAppointmentItem) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:quickAction] appointment quicktext pressed", { id: appt.id });
    setQuickActionToast(null);
    closeSheet();
    setTimeout(() => openSheet("quicktext", appt), 250);
  }, [closeSheet, openSheet]);

  const handleQuickActionPersonalEdit = useCallback((pe: PersonalEvent) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:quickAction] personal event edit pressed", { id: pe.id });
    setQuickActionToast(null);
    setEditingPersonalEvent(pe);
    closeSheet();
    setTimeout(() => openSheet("personal"), 250);
  }, [closeSheet, openSheet]);

  const handleRCEventPress = useCallback((event: RCEvent) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] eventPress", { id: event.id, isPersonal: isPersonalEvent(event), hasMeta: !!event.meta });
    // P2-FE-5: tapping the synthetic draft block opens the chooser
    // popover. The first tap CREATED the draft via `onBlockTap`; the
    // second tap (this one) reveals the Customer/Personal popover.
    if (isDraftSyntheticEventId(event.id)) {
      haptic.light();
      setDraftChooserOpen(true);
      return;
    }
    // P2-FE-5: tapping any real event while a draft exists dismisses
    // the draft AND proceeds to open the event (one gesture). See
    // docs/PLAN-DEVIATIONS.md#2026-04-21-tap-to-create-draft.
    if (useCalendarStore.getState().pendingDraft) {
      dismissPendingDraft();
    }
    if (isPersonalEvent(event)) {
      // 2026-04-21 fix: previously this just opened the personal-event
      // sheet without telling it which event was tapped → the form
      // fell into its CREATE branch, prefilled with `newApptDefaults`,
      // and showed an empty title. Stash the tapped event so the
      // sheet can render in EDIT mode (`<PersonalEventFormSheet event={...} />`).
      const pe = getPersonalEventFromEvent(event);
      if (pe) {
        setEditingPersonalEvent(pe);
      } else {
        console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] personal event tapped but no PersonalEvent in meta", { id: event.id });
      }
      haptic.light();
      openSheet("personal");
      return;
    }
    const appt = getAppointmentFromEvent(event);
    if (appt) {
      // PLAN-DEVIATION: 2026-04-27-pending-tap-to-detail-sheet —
      // P3-FE-8 (C.12) originally routed every tap on a pending
      // appointment straight to /pending-reality/review. That hid
      // the inline edit affordance the user expects on a calendar
      // tile (the long-press quick-action toast's pencil pill, plus
      // the detail sheet's full Edit/Cancel pills) and made pending
      // tiles feel like dead ends — tapping them dropped you into a
      // separate review screen that didn't let you just open the
      // appointment. The C.12 review path is still reachable via
      // the PendingRealityFAB rendered below the calendar canvas
      // and via push notifications. See
      // docs/PLAN-DEVIATIONS.md#2026-04-27-pending-tap-to-detail-sheet
      // for the rationale and anti-instructions.
      haptic.light();
      // P2-FE-5 chunk 2c-prep: in landscape workweek (4 day-columns),
      // pick the half opposite to the tapped column so the source
      // event stays visible while the sheet is open. Days 0-1 → sheet
      // pinned right; days 2-3 → sheet pinned left. Portrait + any
      // single-day view falls through to "full".
      let nextSide: "left" | "right" | "full" = "full";
      if (isLandscape && event.date) {
        const dayIndex = dayjs(event.date).diff(workweekStartDate, "day");
        if (dayIndex >= 0 && dayIndex < 4) {
          nextSide = dayIndex < 2 ? "right" : "left";
        }
      }
      setDetailSheetSide(nextSide);
      openSheet("detail", appt);
    }
  }, [openSheet, setDraftChooserOpen, dismissPendingDraft, isLandscape, workweekStartDate, router]);

  // P2-FE-5: tap an empty cell → create a dashed draft block at that
  // cell. `onBlockTap` is fired by every calendar wrapper. The cell's
  // resource (tech) and date (which encodes time-of-day in the JS
  // Date's clock fields) come from the vendored library.
  const handleRCBlockTap = useCallback((resource: RCResource, date: Date) => {
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    const startMinutes = date.getHours() * 60 + date.getMinutes();
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] blockTap → createDraft", {
      dateStr,
      startMinutes,
      technicianId: resource.id,
    });
    haptic.light();
    createPendingDraft({
      date: dateStr,
      startMinutes,
      technicianId: resource.id,
    });
  }, [createPendingDraft]);

  // P2-FE-5 chunk 2b/2c: long-press is now a free gesture (drag init
  // moved to double-tap inside the vendored library — see
  // README-FORK Phase 17 + the `2026-04-22-double-tap-drag`
  // deviation). Routing rule:
  //   - long-press on the synthetic dashed draft → dismiss it
  //     (gives a second always-on-canvas dismiss path beyond the
  //     Cancel row in the chooser).
  //   - long-press on a real event → open the chunk 2c quick-action
  //     toast routed to "Cancel appt" (CancelSheet).
  //   - long-press on a personal event → open the same toast routed
  //     to "Delete" (useDeletePersonalEvent). Added 2026-04-22 per
  //     "personal event needs to behave the same way" feedback.
  const handleRCEventLongPress = useCallback((event: RCEvent) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:longPress]", { id: event.id, isDraft: isDraftSyntheticEventId(event.id), isPersonal: isPersonalEvent(event) });
    if (isDraftSyntheticEventId(event.id)) {
      haptic.medium();
      dismissPendingDraft();
      return;
    }
    if (isPersonalEvent(event)) {
      const pe = getPersonalEventFromEvent(event);
      if (!pe) {
        console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:longPress] no personal event found", event.id);
        return;
      }
      haptic.medium();
      // Mutually exclusive with the swap-toast — both pin to
      // bottom: 24 and would visually overlap.
      setSwapToast(null);
      // 2026-04-21 fix: `pe.start_time` is now a fully-qualified ISO
      // (`"2026-04-21T13:00:00.000Z"`) per the datetime contract — see
      // `.cursor/rules/datetime-and-data-format-contracts.mdc` § 1.
      // The previous `2000-01-01T${pe.start_time}` concat produced
      // `"2000-01-01T2026-04-21T..."` → dayjs returned Invalid Date.
      // dayjs parses a full ISO directly and converts to local zone.
      const timeStr = pe.start_time
        ? dayjs(pe.start_time).format("h:mm A")
        : null;
      const message = pe.title
        ? (timeStr ? `${pe.title} • ${timeStr}` : pe.title)
        : (timeStr ? `Personal event • ${timeStr}` : "Personal event");
      // Personal events don't carry services; show the date as
      // detail so the user can confirm they're deleting the right
      // one (esp. for recurring titles like "Lunch").
      const detail = pe.date
        ? dayjs(pe.date).format("ddd, MMM D")
        : undefined;
      setQuickActionToast({ kind: "personalEvent", personalEvent: pe, message, detail });
      return;
    }
    const appt = getAppointmentFromEvent(event);
    if (!appt) {
      console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:longPress] no appointment found for event", event.id);
      return;
    }
    haptic.medium();
    setSwapToast(null);
    const timeStr = appt.scheduled_time
      ? dayjs(`2000-01-01T${appt.scheduled_time}`).format("h:mm A")
      : null;
    const message = appt.customer_name
      ? (timeStr ? `${appt.customer_name} • ${timeStr}` : appt.customer_name)
      : (timeStr ? `Appointment • ${timeStr}` : "Appointment");
    const firstService = appt.services?.[0]?.service_name;
    const moreCount = (appt.services?.length ?? 0) - 1;
    const detail = firstService
      ? (moreCount > 0 ? `${firstService} +${moreCount} more` : firstService)
      : undefined;
    setQuickActionToast({ kind: "appointment", appointment: appt, message, detail });
  }, [dismissPendingDraft]);

  const handleRCResourcePress = useCallback((resource: RCResource) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] resourcePress (single)", { id: resource.id, name: resource.name });
    haptic.light();
    toggleCalendarTech(resource.id);
  }, [toggleCalendarTech]);

  const handleRCResourceDoublePress = useCallback((resource: RCResource) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] resourcePress (double)", { id: resource.id, name: resource.name });
    haptic.medium();
    enterWorkweek(resource.id, resource.name);
  }, [enterWorkweek]);

  const handleRCResourceReorder = useCallback((orderedIds: number[]) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:reorder]", { orderedIds });
    haptic.medium();
    setTechOrder(orderedIds);
  }, [setTechOrder]);

  const openNewApptFromDraft = useCallback((draft: DraggedEventDraft) => {
    const dateStr = (typeof draft.date === "string" && draft.date.length >= 10)
      ? draft.date
      : dayjs(selectedDate).format("YYYY-MM-DD");
    const fromMin = Math.round(Math.max(RC_WORK_START, Math.min(draft.from, RC_WORK_END)));
    const timeStr = dayjs(minutesToIso(dateStr, fromMin)).format("HH:mm");
    const technicianId = typeof draft.resourceId === "number" ? draft.resourceId : undefined;
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] release -> opening chooser", { dateStr, timeStr, technicianId });
    haptic.medium();
    // Stash the draft context once and let the chooser route the user
    // to either the customer form (newSheetMode=true) or the personal
    // form. Both forms read the same defaults bag.
    setNewApptDefaults({ date: dateStr, startTime: timeStr, technicianId });
    setTimeout(() => openSheet("chooser"), 250);
  }, [openSheet, selectedDate]);

  const handleChooserPick = useCallback((choice: "customer" | "personal") => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:chooser] pick (franchise)", { choice });
    closeSheet();
    setTimeout(() => {
      if (choice === "customer") {
        setNewSheetMode(true);
        openSheet("form", null);
      } else {
        openSheet("personal");
      }
    }, 250);
  }, [closeSheet, openSheet]);

  // P2-FE-5 (course-corrected 2026-04-21): handoff from
  // FloatingDraftCard's chooser popover into the appointment form
  // sheet. Stashes date/time/tech from the live PendingDraft into
  // newApptDefaults, dismisses the draft (the form is the new locus
  // of intent — no need to keep the dashed block behind the sheet),
  // and launches the right form. If the user cancels the form, no
  // draft is lingering for them to dismiss separately.
  //
  // 2026-04-21 race fix: previously this handler re-read
  // `pendingDraft` from the store at execution time and warned if it
  // was null. That created a brittle window where any concurrent
  // mutation (rapid double-tap, parallel dismissDraft from a
  // re-render) could clear the store between `handleChoose`'s
  // null-guard and this callback's read, producing the
  // `[CAL:draft] chooser pick fired with no pending draft` warning
  // and a no-op pick. `FloatingDraftCard.handleChoose` already
  // validates `draft` before calling `onChooseKind`, so we just
  // accept the draft as an argument now — the only source of truth
  // is the closure that fired the gesture, not whatever the store
  // looks like by the time React re-renders.
  const handleDraftChooserPick = useCallback(
    (kind: "customer" | "personal", draft: PendingDraft) => {
      const startTime = dayjs(minutesToIso(draft.date, draft.startMinutes)).format("HH:mm");
      // Item 4 (2026-04-21 audit): warn loudly if the draft has no
      // tech association. The personal-event submit path turns
      // `defaultTechnicianId` into the event's `shared_with`; without
      // it, the event commits with no tech association and is
      // invisible on every column. Should be unreachable
      // (`handleRCBlockTap` always sets technicianId from
      // `resource.id`), but the silent-fail mode is bad enough that
      // a defensive warn earns its weight.
      if (kind === "personal" && draft.technicianId == null) {
        console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] personal pick has no technicianId — event will be created with no shared_with and may be invisible", { draft });
      }
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] chooser pick → opening form", {
        kind,
        date: draft.date,
        startTime,
        technicianId: draft.technicianId,
      });
      setNewApptDefaults({
        date: draft.date,
        startTime,
        technicianId: draft.technicianId ?? undefined,
      });
      // P3-FE-6: do NOT dismiss the pending draft at chooser-pick
      // time. The dashed block stays alive (visually behind the
      // BottomSheet that's about to mount) so that an implicit
      // close (tap-outside, swipe-down, navigation) leaves the
      // dashed block on screen → user re-taps → chooser → form
      // re-mounts with the same `cacheKey = draft:<draftId>` → the
      // sheet-draft cache rehydrates the user's typing. The form
      // sheet's `onSubmitted` callback (wired below at the mount
      // sites) calls `dismissPendingDraft` from the save-success
      // / cancel paths so the draft is cleaned up on commit.
      haptic.medium();
      if (kind === "customer") {
        setNewSheetMode(true);
        openSheet("form", null);
      } else {
        openSheet("personal");
      }
    },
    [openSheet],
  );

  // P2-FE-8 — embedded avatar selector pick handler. Called when the
  // user taps a chip in `<EmbeddedAvatarSelector>` mounted by
  // `<FloatingDraftCard>`. Mutates the pending draft's technicianId
  // (so `useResourcesWithDraft` re-injects the dashed block under
  // the picked tech's column) and, when the user is in landscape
  // empty-mode, narrows `selectedTechIds` to that one tech so the
  // column actually appears in the grid. The narrow has no effect
  // when one or more techs are already selected — the user has
  // already chosen the visible techs and the dashed block will
  // render so long as the picked tech is among them.
  const handleDraftPickTechnician = useCallback(
    (techId: number) => {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] embedded selector pick", { techId });
      setDraftTechnicianAction(techId);
      const currentSelection = useCalendarStore.getState().selectedTechIds;
      if (currentSelection.length === 0) {
        setSelectedTechIdsAction([techId]);
      } else if (!currentSelection.includes(techId)) {
        // Picked tech is currently filtered out of the visible
        // selection — push them onto it so the column appears.
        // Order: keep existing first, append picked. This preserves
        // the user's mental model of "I already had A, B selected;
        // now I added C."
        setSelectedTechIdsAction([...currentSelection, techId]);
      }
    },
    [setDraftTechnicianAction, setSelectedTechIdsAction],
  );

  const chooserContextLabel = useMemo(() => {
    const d = newApptDefaults.date;
    const t = newApptDefaults.startTime;
    if (!d || !t) return undefined;
    const m = dayjs(`${d}T${t}:00`);
    if (!m.isValid()) return undefined;
    const isToday = dayjs().format("YYYY-MM-DD") === d;
    const dateLabel = isToday ? "Today" : m.format("ddd, MMM D");
    return `${dateLabel} · ${m.format("h:mm A")}`;
  }, [newApptDefaults.date, newApptDefaults.startTime]);

  const handleRCDragEnd = useCallback((draft: DraggedEventDraft) => {
    try {
      if (!draft.event) {
        console.warn("[RC DRAG] draft has no event, ignoring");
        traceCalendar("drag end IGNORED — no event", {}, "warning");
        return;
      }
      traceCalendar("drag end entry", {
        eventId: draft.event.id,
        date: draft.date,
        toResourceId: draft.resourceId,
        fromTime: draft.from,
        toTime: draft.to,
        viewMode: viewMode,
        futureMode,
      });
      // PR-UX-2 PASS 2.10 diagnostic — single entry log at the top of
      // every drag-end so on-device traces unambiguously show which
      // branch the dispatcher took. Without this, ghost-drag bugs are
      // indistinguishable from "user accidentally grabbed the real
      // card under the ghost" (i.e. the deferred `c8` hit-test issue).
      // The log is keyed by `eventId` so we can correlate with the
      // gesture-engine logs above. `branch` is computed eagerly so the
      // log itself documents the dispatcher's intent.
      const _evtId = draft.event.id;
      const _branch =
        isDraftSyntheticEventId(_evtId) ? "draft-synthetic"
        : isDraftEvent(draft.event) ? "draft-legacy"
        : isPersonalEvent(draft.event) ? "personal-event"
        : isMoveChainGhostEventId(_evtId) ? "ghost-modify-intent"
        : "appointment";
      console.log("[RC DRAG] entry", {
        eventId: _evtId,
        isGhost: isMoveChainGhostEventId(_evtId),
        branch: _branch,
        date: draft.date,
        from: draft.from,
        to: draft.to,
        resourceId: draft.resourceId,
        evtFrom: draft.event.from,
        evtTo: draft.event.to,
        evtResourceId: draft.event.resourceId,
      });
      // P2-FE-5: drag-to-move on the synthetic draft block. Snap the
      // PendingDraft state to the new cell instead of opening any
      // sheet — the chooser is only triggered by tap-on-draft, not by
      // drag end.
      if (isDraftSyntheticEventId(draft.event.id)) {
        const dateStr = (typeof draft.date === "string" && draft.date.length >= 10)
          ? draft.date
          : dayjs(selectedDate).format("YYYY-MM-DD");
        // 2026-05-06: duration-preserving clamp — see helper above for
        // rationale. Drops near the top/bottom edges no longer silently
        // shrink the appointment.
        const { from: fromMin, to: toMin } = clampDragRangeToWorkWindow(
          draft.from,
          draft.to,
          draft.event.from,
          draft.event.to,
        );
        const technicianId = typeof draft.resourceId === "number" ? draft.resourceId : null;
        // P2-FE-6 (master plan §5.1.7): pinch-to-resize on the
        // floating draft snaps duration to 15-min increments. The
        // library's pinch-end fires the same `setDraggedEventDraft`
        // pipeline as drag-to-move (with `isResize=true`), so this
        // branch handles both — pure moves don't change duration so
        // the snap is a no-op for them; pinch-driven resizes pick
        // up the snap here.
        //
        // Why 15 min rather than the library's `snapIntervalInMinutes`
        // (5 min today): drafts are user-facing time-blocks where
        // round numbers (15/30/45/60) read better than 5-min
        // granularity. The 5-min library snap stays in effect for
        // real committed appointments — it's only the synthetic-
        // draft branch that re-snaps.
        const rawDuration = toMin - fromMin;
        const snappedDuration = Math.max(15, Math.round(rawDuration / 15) * 15);
        console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] drag-to-move/resize → updateDraft", {
          dateStr,
          fromMin,
          rawDuration,
          snappedDuration,
          technicianId,
        });
        updatePendingDraft({
          date: dateStr,
          startMinutes: fromMin,
          durationMinutes: snappedDuration,
          technicianId,
        });
        return;
      }
      if (isDraftEvent(draft.event)) {
        // Legacy long-press flow (still wired for backwards compat —
        // real users now hit the synthetic-event branch above).
        openNewApptFromDraft(draft);
        return;
      }

      // 2026-04-21: personal-event drag branch. Until now this fell
      // through to `getAppointmentFromEvent`, which returned null and
      // bailed with "no appt found" — leaving the user unable to move
      // their own personal events even within the creator's column.
      //
      // Two cases to handle:
      //   - Same column (`draft.event.resourceId === draft.resourceId`):
      //     update `start_time`/`end_time` on the personal event via
      //     `useUpdatePersonalEvent`. No reschedule sheet — these are
      //     1-person events with no customer to notify.
      //   - Cross column: silently revert. The user explicitly noted
      //     "it makes sense I couldn't drag them to other columns",
      //     and `personal_events` doesn't expose a tech-reassignment
      //     primitive (the form preserves the original `shared_with`
      //     for the same reason). Visual revert happens automatically
      //     because we don't mutate; the next render snaps back.
      if (isPersonalEvent(draft.event)) {
        const pe = getPersonalEventFromEvent(draft.event);
        if (!pe) {
          console.warn("[RC DRAG] personal event drag but no PersonalEvent in meta", { eventId: draft.event.id });
          return;
        }
        const originalResourceId = draft.event.resourceId;
        const landedResourceId = draft.resourceId;
        if (originalResourceId !== landedResourceId) {
          console.log("[RC DRAG] personal-event cross-column drag rejected", {
            peId: pe.id,
            from: originalResourceId,
            to: landedResourceId,
          });
          haptic.light();
          return;
        }

        const peRawFrom = draft.from;
        const peRawTo = draft.to;
        const peRawDate = draft.date;
        const peFrom = Number.isFinite(peRawFrom) ? peRawFrom : draft.event.from;
        const peTo = Number.isFinite(peRawTo) ? peRawTo : draft.event.to;
        const peDate = (typeof peRawDate === "string" && peRawDate.length >= 10) ? peRawDate : selectedDate;
        // 2026-05-06: duration-preserving clamp — see helper above.
        const { from: peClampedFrom, to: peClampedTo } = clampDragRangeToWorkWindow(
          peFrom,
          peTo,
          draft.event.from,
          draft.event.to,
        );

        const toHhmm = (min: number) =>
          `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

        // 2026-04-21: same datetime contract as the form-sheet submit
        // path — see `localToBackendISO` in `src/utils/datetime.ts` and
        // `.cursor/rules/datetime-and-data-format-contracts.mdc`. A
        // naive `${date}T${time}:00` string would land in `timestamptz`
        // as UTC and round-trip 4 hours off (the original "wrong times"
        // bug). Always send a TZ-qualified ISO.
        const peStartIso = localToBackendISO(peDate, toHhmm(peClampedFrom));
        const peEndIso = localToBackendISO(peDate, toHhmm(peClampedTo));

        console.log("[RC DRAG] personal event update", {
          peId: pe.id,
          peDate,
          peStartIso,
          peEndIso,
        });
        haptic.medium();
        updatePersonalEventMutation.mutate({
          id: pe.id,
          payload: {
            title: pe.title,
            date: peDate,
            start_time: peStartIso,
            end_time: peEndIso,
            notes: pe.notes ?? undefined,
            shared_with: pe.shared_with,
          },
        });
        return;
      }

      // PR-UX-2 PASS 2.8 task `c7` — drag-on-ghost branch. Move-chain
      // destination ghosts carry a synthetic negative event id
      // (`moveChainGhostEventIdFor(intent_id)`); they have no
      // underlying CalendarAppointmentItem, so the legacy
      // `getAppointmentFromEvent` fall-through returns null and bails
      // with "no appt found". Intercept here instead and route to the
      // `modify_intent` BE op so the underlying intent's destination
      // payload updates in place (rather than creating a brand-new
      // intent for what the user mentally read as "the same staged
      // move, just landing somewhere different").
      //
      // Linter treatment: NO intercept sheet. Modifying an existing
      // staged intent is a different operation than staging a fresh
      // one, and the intercept's "Apply anyway / Stage / Dismiss"
      // semantics don't map. The standard `runLocalLinter` re-run on
      // mutation success writes any new conflicts into
      // `usePendingRealityStore.linterIssues` for the FAB / HUD /
      // review screen to surface.
      if (isMoveChainGhostEventId(draft.event.id)) {
        const intentId = intentIdFromGhostEventId(draft.event.id);
        if (intentId === null) {
          console.warn("[RC DRAG] ghost id failed to decode", { eventId: draft.event.id });
          return;
        }
        const { sessionId, intents: storeIntents } =
          usePendingRealityStore.getState();
        const intent = storeIntents.find((i) => i.id === intentId);
        if (!intent || sessionId === null) {
          console.warn("[RC DRAG] ghost drag bailed", {
            intentId,
            haveIntent: !!intent,
            sessionId,
          });
          return;
        }

        const ghostRawFrom = draft.from;
        const ghostRawTo = draft.to;
        const ghostRawDate = draft.date;
        const ghostFrom = Number.isFinite(ghostRawFrom)
          ? ghostRawFrom
          : draft.event.from;
        const ghostTo = Number.isFinite(ghostRawTo)
          ? ghostRawTo
          : draft.event.to;
        const ghostDate =
          typeof ghostRawDate === "string" && ghostRawDate.length >= 10
            ? ghostRawDate
            : selectedDate;
        // 2026-05-06: duration-preserving clamp — see helper above.
        const { from: ghostClampedFrom, to: ghostClampedTo } = clampDragRangeToWorkWindow(
          ghostFrom,
          ghostTo,
          draft.event.from,
          draft.event.to,
        );
        const ghostTechId =
          typeof draft.resourceId === "number" ? draft.resourceId : null;

        // Look up the source appointment so the helper can decide
        // whether a `reassign` ghost drop should stay reassign (same
        // date+time, just different tech) or escalate to reschedule
        // (date/time changed). Walking dayQuery instead of using
        // `dragWorldSnapshot` because the snapshot deliberately
        // filters OUT appointments with active intents — i.e. the
        // exact rows we need to look up here.
        let sourceAppointment: GhostDragSourceAppointment | null = null;
        if (intent.appointment_id !== null) {
          const techCols = dayQuery.data?.technicians ?? [];
          for (const t of techCols) {
            const a = (t.appointments ?? []).find(
              (x) => x.id === intent.appointment_id,
            );
            if (a) {
              if (a.technician_id !== null && a.scheduled_date !== null) {
                sourceAppointment = {
                  technician_id: a.technician_id,
                  scheduled_date: a.scheduled_date,
                  scheduled_time: a.scheduled_time,
                  scheduled_start_time: a.scheduled_time ?? undefined,
                  scheduled_end_time: a.scheduled_end_time ?? undefined,
                };
              }
              break;
            }
          }
        }

        const newPayload = buildModifyIntentPayloadForGhostDrag(
          intent,
          {
            date: ghostDate,
            startMinutes: ghostClampedFrom,
            endMinutes: ghostClampedTo,
            technicianId: ghostTechId,
          },
          sourceAppointment,
        );
        if (!newPayload) {
          console.warn("[RC DRAG] ghost drag produced no payload", {
            intentId,
            intentKind: intent.payload.kind,
            haveSource: !!sourceAppointment,
          });
          return;
        }

        console.log("[RC DRAG] ghost drag → modify_intent", {
          sessionId,
          intentId,
          intentKind: intent.payload.kind,
          newPayloadKind: newPayload.kind,
          oldPayload: intent.payload,
          newPayload,
          dest: {
            date: ghostDate,
            from: ghostClampedFrom,
            to: ghostClampedTo,
            techId: ghostTechId,
          },
        });
        haptic.medium();
        modifyChainIntent.mutate(
          {
            sessionId,
            intentId,
            intent: newPayload,
            worldSnapshot: dragWorldSnapshot,
          },
          {
            onSuccess: (data) => {
              // PR-UX-2 PASS 2.10 diagnostic — log what the BE
              // actually returned so we can confirm the destination
              // payload changed. If the returned intent's payload is
              // the same as `oldPayload`, the visual snap-back the
              // user reported is a BE no-op; if it changed but the
              // ghost still renders at the old slot, the bug is in
              // ghost-tile-rebuild from store updates instead.
              const updatedIntent = data.intents.find((i) => i.id === intentId);
              console.log("[RC DRAG] modify_intent success", {
                intentId,
                returnedPayload: updatedIntent?.payload,
                returnedIntentCount: data.intents.length,
              });
            },
            onError: (err) => {
              // PR-UX-2 PASS 2.10 — surface ghost-drag failures.
              // Without this the ghost silently snaps back to the
              // original slot and the user has no idea anything
              // failed.
              //
              // PR-UX-2 PASS 2.12 (2026-05-05) refined the copy:
              // the previous 403 message attributed every failure
              // to "FO override not deployed", but a 403 can come
              // from EITHER the route-level `authorize` guard
              // (role rejection — happens when the FO permission
              // backend isn't deployed yet, or never will be for
              // a non-FO/franchisor caller) OR the service-level
              // `assertEditPermission` (cross-franchise FO,
              // already-finalized session, etc.). 404 used to be
              // common because the dev-seed buttons wrote
              // straight into local Zustand and produced phantom
              // session ids; PASS 2.12 ALSO migrated all three
              // seed buttons to hit the real BE create endpoint,
              // so the 404 path should be rare on master — it's
              // retained for the "session was cancelled in
              // another tab between drag-start and drag-end" race
              // and for any other seed surface that still writes
              // local-only.
              const status =
                typeof err === "object" && err !== null && "response" in err
                  ? (err as { response?: { status?: number } }).response?.status
                  : undefined;
              const message =
                typeof err === "object" && err !== null && "message" in err
                  ? String((err as { message?: unknown }).message)
                  : "Unknown error";
              console.error("[RC DRAG] modify_intent error", {
                status,
                message,
                err,
              });
              const body =
                status === 403
                  ? "You don't have permission to edit this draft session right now."
                  : status === 404
                    ? "This staged session is no longer on the server — it may have been cancelled or finalized in another tab. Re-seed from the Pending Reality screen and try again."
                    : `The change didn't save: ${message}`;
              Alert.alert("Couldn't move staged card", body);
            },
          },
        );
        return;
      }

      const appt = getAppointmentFromEvent(draft.event);
      if (!appt) { console.warn("[RC DRAG] no appt found"); return; }

      const rawFrom = draft.from;
      const rawTo = draft.to;
      const rawDate = draft.date;

      console.log("[RC DRAG END raw]", { rawFrom, rawTo, rawDate, resourceId: draft.resourceId, evtFrom: draft.event.from, evtTo: draft.event.to });

      const from = Number.isFinite(rawFrom) ? rawFrom : draft.event.from;
      const to = Number.isFinite(rawTo) ? rawTo : draft.event.to;
      const date = (typeof rawDate === "string" && rawDate.length >= 10) ? rawDate : selectedDate;

      // 2026-05-06: duration-preserving clamp — see helper above. Fixes
      // the "appointment squishes when dropped near the calendar edge"
      // bug where a 45-min appointment dropped 30 min above 5:30 was
      // committed as a 15-min appointment.
      const { from: clampedFrom, to: clampedTo } = clampDragRangeToWorkWindow(
        from,
        to,
        draft.event.from,
        draft.event.to,
      );

      const newStart = minutesToIso(date, clampedFrom);
      const newEnd = minutesToIso(date, clampedTo);
      const newTechId = draft.resourceId;

      if (!dayjs(newStart).isValid() || !dayjs(newEnd).isValid()) {
        console.warn("[RC DRAG END] invalid ISO produced, aborting", { newStart, newEnd });
        return;
      }

      const sig = `${appt.id}|${newStart}|${newEnd}|${String(newTechId)}`;
      const now = Date.now();
      if (
        lastHandledDragRef.current &&
        lastHandledDragRef.current.sig === sig &&
        now - lastHandledDragRef.current.ts < 600
      ) {
        console.log("[RC DRAG] dedup blocked", sig);
        return;
      }
      lastHandledDragRef.current = { sig, ts: now };

      const techName = dayQuery.data?.technicians?.find(
        (t) => t.technician_id === newTechId,
      )?.technician_name;

      // ── Quick-swap fast path ────────────────────────────────────
      // When the user has narrowed the calendar to a multi-select set
      // and drags a card between two of those techs at the same date +
      // same time, skip the full Reschedule sheet. Fire the lightweight
      // reassign mutation (with optimistic UI) and show an undo toast.
      const apptStartMin = (() => {
        const t = appt.scheduled_time ?? "00:00:00";
        const [h, m] = t.split(":").map((x) => parseInt(x, 10));
        return (h || 0) * 60 + (m || 0);
      })();
      const isSameDate = appt.scheduled_date === date;
      const isSameTime = clampedFrom === apptStartMin;
      const fromTechId = appt.technician_id;
      const isTechChange =
        typeof newTechId === "number" &&
        typeof fromTechId === "number" &&
        newTechId !== fromTechId;
      const bothInSelection =
        isTechChange &&
        selectedTechIds.length > 0 &&
        selectedTechIds.includes(fromTechId as number) &&
        selectedTechIds.includes(newTechId as number);

      if (isSameDate && isSameTime && isTechChange && bothInSelection) {
        console.log("[RC DRAG] quick-swap fast path", {
          apptId: appt.id,
          from: fromTechId,
          to: newTechId,
        });
        haptic.medium();
        // P3-FE-7: route through the linter intercept. On a clean
        // result the live reassign fires and the swap toast opens
        // exactly as before. On an issue the canvas snaps back
        // (no optimistic update applied) and the intercept sheet
        // opens via the host store; "Apply anyway" re-runs the
        // reassign + toast, "Stage" stages the intent.
        dragReassignSubmit({
          appointmentId: appt.id,
          fromTechId: fromTechId as number,
          toTechId: newTechId as number,
          afterCommit: () => {
            // P2-FE-5 chunk 2c: opening the swap toast clears any
            // pending quick-action toast so the two never co-exist.
            setQuickActionToast(null);
            setSwapToast({
              message: techName ? `Moved to ${techName}` : "Appointment reassigned",
              detail: appt.scheduled_time
                ? `${dayjs(`2000-01-01T${appt.scheduled_time}`).format("h:mm A")} • ${appt.customer_name ?? "Appointment"}`
                : appt.customer_name ?? undefined,
              inverse: {
                kind: "reassign",
                appointmentId: appt.id,
                fromTechId: fromTechId as number,
                toTechId: newTechId as number,
              },
              editContext: {
                appointment: appt,
                currentStartIso: newStart,
                currentEndIso: newEnd,
                currentTechId:
                  typeof newTechId === "number" ? newTechId : undefined,
                currentTechName: techName,
              },
            });
          },
        }).catch((err) => {
          // P3-FE-DIAG-409-LOGGING (transient): structured log so a
          // 409 (or any other status) from the quick-swap fast path
          // surfaces the backend's `data.message` instead of a bare
          // AxiosError. The centralized `useReassignAppointment.onError`
          // also logs the same shape — this consumer-side log
          // additionally captures the live calendar `calTag` so
          // multi-mounted calendar contexts can be told apart in the
          // Metro logs. Greppable prefix `[CAL:409-DIAG]`.
          const e = err as
            | {
                response?: {
                  status?: number;
                  data?: { message?: string } | unknown;
                };
              }
            | undefined;
          const body = e?.response?.data;
          console.error(
            `[${calTag(viewMode, isLandscape)}] [CAL:409-DIAG] quick-swap reassign failed`,
            {
              status: e?.response?.status,
              message:
                body && typeof body === "object" && "message" in body
                  ? (body as { message?: string }).message
                  : undefined,
              body,
              payload: {
                appointmentId: appt.id,
                fromTechId: fromTechId as number,
                toTechId: newTechId as number,
              },
            },
          );
        });
        return;
      }

      // ── Silent commit + undo toast (formerly: open Reschedule sheet)
      //
      // PLAN-DEVIATION: 2026-04-22-drop-commit-with-undo
      // See docs/PLAN-DEVIATIONS.md#2026-04-22-drop-commit-with-undo
      // for full rationale, touch points, and anti-instructions.
      //
      // user feedback: the dwell pattern's 1.15s buzz sequence is
      // already a deliberate-action checkpoint (the user has to
      // hover an avatar long enough for buzz 3 to fire OR drag a
      // card to a new cell with intent), so the post-drop
      // Reschedule sheet was double-confirming the same intent
      // and breaking flow on accidental drops. Switch to optimistic
      // commit + 5s undo toast, mirroring the existing quick-swap
      // fast path above. The Reschedule sheet stays available as
      // an "Edit details" escape hatch from the toast (see Phase D
      // wiring on `EventQuickActionToast`'s Edit pill, plus the
      // existing long-press → reschedule path on a committed
      // event).
      console.log("[RC DRAG] silent commit + toast", {
        apptId: appt.id,
        newStart,
        newEnd,
        newTechId,
        techName,
      });
      haptic.medium();

      // Snapshot the prior state for the inverse BEFORE firing the
      // mutation, so the optimistic cache update doesn't race the
      // snapshot read.
      const priorStartIso =
        appt.scheduled_date && appt.scheduled_time
          ? `${appt.scheduled_date}T${appt.scheduled_time}`
          : newStart;
      const priorEndIso =
        appt.scheduled_date && appt.scheduled_end_time
          ? `${appt.scheduled_date}T${appt.scheduled_end_time}`
          : newEnd;
      const priorTechId =
        typeof appt.technician_id === "number" ? appt.technician_id : undefined;

      // Build the toast metadata up-front so the after-commit
      // callback can fire it after the live mutation lands.
      const newTimeLabel = dayjs(newStart).format("h:mm A");
      const newDateLabel = dayjs(newStart).format("ddd MMM D");
      const sameDayAsBefore = appt.scheduled_date === date;
      const sameTimeAsBefore = (() => {
        const t = appt.scheduled_time ?? "00:00:00";
        const [h, m] = t.split(":").map((x) => parseInt(x, 10));
        return clampedFrom === (h || 0) * 60 + (m || 0);
      })();
      const techChanged =
        typeof newTechId === "number" &&
        typeof priorTechId === "number" &&
        newTechId !== priorTechId;
      const timeChanged = !(sameDayAsBefore && sameTimeAsBefore);
      let message: string;
      if (techChanged && timeChanged) {
        const when = sameDayAsBefore ? newTimeLabel : `${newDateLabel} ${newTimeLabel}`;
        message = techName ? `Moved to ${techName}, ${when}` : `Moved to ${when}`;
      } else if (techChanged) {
        message = techName ? `Moved to ${techName}` : "Appointment reassigned";
      } else {
        const when = sameDayAsBefore ? newTimeLabel : `${newDateLabel} ${newTimeLabel}`;
        message = `Moved to ${when}`;
      }
      const detail = appt.customer_name ?? undefined;

      // Compute the proposed-intent date / time slices in the
      // discriminated `ReschedulePayload` shape (date + HH:mm:ss
      // strings, not full ISO).
      const newStartHHmm = dayjs(newStart).format("HH:mm:ss");
      const newEndHHmm = dayjs(newEnd).format("HH:mm:ss");

      // P3-FE-7: route through the linter intercept. On a clean
      // result the live reschedule fires and the toast opens
      // exactly as before. On an issue the canvas snaps back
      // (no optimistic update applied) and the intercept sheet
      // opens; "Apply anyway" re-runs the reschedule + toast,
      // "Stage" stages the intent.
      dragRescheduleSubmit({
        appointmentId: appt.id,
        newStart,
        newEnd,
        newTechId: typeof newTechId === "number" ? newTechId : undefined,
        newDateYmd: date,
        newStartHHmm,
        newEndHHmm,
        afterCommit: () => {
          // Mutually exclusive with the quick-action toast — opening
          // either should close the other.
          setQuickActionToast(null);
          setSwapToast({
            message,
            detail,
            inverse: {
              kind: "reschedule",
              appointmentId: appt.id,
              priorStartIso,
              priorEndIso,
              priorTechId,
            },
            editContext: {
              appointment: appt,
              currentStartIso: newStart,
              currentEndIso: newEnd,
              currentTechId:
                typeof newTechId === "number" ? newTechId : undefined,
              currentTechName: techName,
            },
          });
        },
      }).catch((err) => {
        // P3-FE-DIAG-409-LOGGING (transient): structured log of the
        // backend response envelope (status / data.message / data /
        // payload) so we can confirm whether 409s are real overlap
        // conflicts or the "Appointment already on this route"
        // dispatch-bug path. Centralized `useRescheduleAppointment.onError`
        // also logs this — this consumer-side log additionally
        // captures the calendar `calTag` plus the original drag
        // params (drop date/time/tech) before the payload was
        // re-shaped for the mutation. Greppable prefix
        // `[CAL:409-DIAG]`.
        const e = err as
          | {
              response?: {
                status?: number;
                data?: { message?: string } | unknown;
              };
            }
          | undefined;
        const body = e?.response?.data;
        console.error(
          `[${calTag(viewMode, isLandscape)}] [CAL:409-DIAG] drag-reschedule failed`,
          {
            status: e?.response?.status,
            message:
              body && typeof body === "object" && "message" in body
                ? (body as { message?: string }).message
                : undefined,
            body,
            payload: {
              appointmentId: appt.id,
              newStart,
              newEnd,
              newTechId,
              newDateYmd: date,
              newStartHHmm,
              newEndHHmm,
            },
          },
        );
      });
    } catch (err) {
      console.error("[RC DRAG] error in handleRCDragEnd", err);
    }
  }, [
    dayQuery.data,
    selectedDate,
    selectedTechIds,
    reassign,
    reschedule,
    updatePersonalEventMutation,
    dragRescheduleSubmit,
    dragReassignSubmit,
    modifyChainIntent,
    dragWorldSnapshot,
  ]);

  useEffect(() => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:query] dayQuery", { status: dayQuery.status, techCount: dayQuery.data?.technicians?.length, date: viewMode === "day" ? selectedDate : "(inactive)" });
  }, [dayQuery.status, dayQuery.data, selectedDate, viewMode]);

  useEffect(() => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:query] weekQuery", { status: weekQuery.status, dayCount: Array.isArray(weekQuery.data) ? weekQuery.data.length : 0, startDate: viewMode === "week" ? workweekStartDate : "(inactive)" });
  }, [weekQuery.status, weekQuery.data, workweekStartDate, viewMode]);

  useEffect(() => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:render] FranchiseOwnerCalendar", { viewMode, selectedDate, showMap, workweekTechId, activeSheet });
  }, [viewMode, selectedDate, showMap, workweekTechId, activeSheet]);

  useEffect(() => {
    if (viewMode !== "week") return;
    const weekTechs = Array.isArray(weekQuery.data)
      ? weekQuery.data.flatMap((d) => d.technicians ?? [])
      : [];
    const techs = weekTechs.length > 0 ? weekTechs : (dayQuery.data?.technicians ?? []);
    if (techs.length === 0) return;
    // D2P-FE-14 — re-validate workweekTechId against the fresh
    // roster instead of the original `|| workweekTechId` early-out.
    // After the demo reset (or any wipe-and-reseed) the previously-
    // selected workweek tech may not exist in the new roster,
    // leaving the week view rendering an ID with zero events. The
    // ID-set check covers both "never picked" (workweekTechId ===
    // null) and "stale ID" cases.
    const validIds = new Set(techs.map((t) => t.technician_id));
    if (workweekTechId != null && validIds.has(workweekTechId)) return;
    const first = techs[0];
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:autoSelect] picking first tech for week view:", first.technician_id, first.technician_name, {
      reason: workweekTechId == null ? "initial" : "stale-id-replaced",
    });
    enterWorkweek(first.technician_id, first.technician_name);
  }, [viewMode, workweekTechId, weekQuery.data, dayQuery.data, enterWorkweek]);

  const isLoading = viewMode === "day" ? dayQuery.isLoading : viewMode === "week" ? weekQuery.isLoading : false;

  if (isLoading) return <SkeletonListScreen />;

  // PR-UX-6 (2026-05-08 follow-up): wrap the FO portrait body in
  // `<CollapsibleTopProvider>` so the chrome's collapse-progress
  // SV is reachable from BOTH `<CollapsibleTop>` (which renders
  // the chrome) and the workweek view (which sits below it as a
  // sibling and needs to re-measure the avatar strip's window bbox
  // when the chrome's height animates). See
  // docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
  return (
    <GestureHandlerRootView style={styles.container}>
      <CollapsibleTopProvider>
      {isLandscape ? null : (
        <CollapsibleTop>
        <DailyBriefingBanner
          alertCount={franchiseBriefingSummary.materialIssueCount + franchiseBriefingSummary.alertCount}
          subtitle={franchiseBriefingSummary.subtitle}
          onPress={() => router.push("/briefing")}
        />

        <CalendarHeader
          showNewButton
          showMapToggle
          showViewModes
          showDensityToggle
          showSettingsButton
          onNewPress={() => { setNewSheetMode(true); openSheet("form", null); }}
          onSettingsPress={() => openSheet("quick-settings")}
        />

        <CalendarOverviewBar franchiseId={franchiseId} date={selectedDate} onFlexPress={() => openSheet("flex")} />
      </CollapsibleTop>
      )}

      {isLandscape ? (
        // P2-FE-4: full-bleed landscape workweek canvas. Map mode +
        // Pending Reality HUD (the two surviving chrome elements per
        // §5.1.1) land in their own chunks (P2-FE-5+ / P2-FE-12).
        //
        // PLAN-DEVIATION: 2026-04-20-landscape-empty-grid-leak — the
        // `key="cal-landscape"` on CalendarBindingProvider forces a
        // fresh Zustand store instance whenever we switch into the
        // landscape branch, so events written by ResourceCalendarDayView
        // / ResourceCalendarWorkweekView in a previous orientation
        // don't survive into LandscapeWorkweekView's StoreFeeder.
        // See docs/PLAN-DEVIATIONS.md#2026-04-20-landscape-empty-grid-leak
        <View style={{ flex: 1 }} onLayout={handleCalendarLayout}>
          <CalendarBindingProvider key="cal-landscape">
            <LandscapeWorkweekView
              franchiseId={franchiseId}
              selectedDate={selectedDate}
              weekData={weekDataForCanvas}
              workweekStartDate={workweekStartDate}
              hourHeight={hourHeight}
              availableTechs={availableWorkweekTechs}
              onZoom={handleZoom}
              onEventPress={handleRCEventPress}
              onEventLongPress={handleRCEventLongPress}
              onBlockTap={handleRCBlockTap}
              onDragEnd={handleRCDragEnd}
            />
            {/* P2-FE-6: `LandscapeWorkweekView` mounts its own
                drag-end subscription (with avatar-drop intercept)
                so a parallel `<RCDragSubscription>` here would race
                the `setDraft(null)` consumption. The view forwards
                non-avatar drops to the `onDragEnd` prop above. */}
          </CalendarBindingProvider>
        </View>
      ) : showMap ? (
        <FranchiseRouteMap franchiseId={franchiseId} date={selectedDate} />
      ) : viewMode === "month" ? (
        <MonthView />
      ) : viewMode === "week" && workweekTechId ? (
        <View style={{ flex: 1 }} onLayout={handleCalendarLayout}>
        {/* PLAN-DEVIATION: 2026-05-08-portrait-week-hover-dwell-parity —
            key intentionally drops `${workweekTechId}` so the
            calendar binding provider stays mounted across hover-
            dwell tech swaps mid-drag. Without this, swapping
            `workweekTechId` during a drag would remount the
            provider, killing the gesture handler and breaking the
            "drag visual stays attached to the user's finger
            across the swap" requirement. The `cal-week`/`cal-day`
            distinction (vs the previous `cal-week-${id}`) still
            satisfies the original `2026-04-20-landscape-empty-grid-leak`
            concern — the binding store is fresh on every entry into
            week mode; only intra-week tech swaps reuse the store.
            See docs/PLAN-DEVIATIONS.md#2026-05-08-portrait-week-hover-dwell-parity. */}
        {/* PR-UX-5 (2026-05-08): Now⇄Future toggle. 2026-05-10 user
            fix: relocated from a sibling above the canvas into the
            `<MoveChainChipRow>`'s `bottomSlot`. Threaded through
            ResourceCalendarWorkweekView's `chipRowBottomSlot` prop
            so the toggle nests inside the chip row's white pill,
            occupying the otherwise-empty band under the dot row.
            Still gated on `hasStagedIntents` (no point projecting
            nothing); when the chip row hides (no chains detected /
            week query in flight) the slot collapses with it, which
            is acceptable because the projection has nothing to
            visualize until at least one chain materializes. */}
        <CalendarBindingProvider key="cal-week">
          {/* The workweek view owns its own
              `useDraggedEventDraftSubscription` so a parallel
              `<RCDragSubscription>` here would race the
              `setDraft(null)` consumption — see the workweek
              view's `Props.onDragEnd` doc-block. Mirrors the
              landscape branch's ownership model. */}
          <ResourceCalendarWorkweekView
            weekData={weekDataForCanvas}
            techId={workweekTechId}
            techName={workweekTechName ?? ""}
            workweekStartDate={workweekStartDate}
            hourHeight={hourHeight}
            viewportHeight={calendarViewportH}
            onZoom={handleZoom}
            onEventPress={handleRCEventPress}
            onEventLongPress={handleRCEventLongPress}
            onBlockTap={handleRCBlockTap}
            onBackPress={exitWorkweek}
            onPrevWeek={() => useCalendarStore.getState().goToPreviousWeek()}
            onNextWeek={() => useCalendarStore.getState().goToNextWeek()}
            availableTechs={availableWorkweekTechs}
            onSwitchTech={(id, name) => enterWorkweek(id, name)}
            onDragEnd={handleRCDragEnd}
            chipRowBottomSlot={
              hasStagedIntents ? <NowFutureToggle /> : null
            }
          />
        </CalendarBindingProvider>
        </View>
      ) : viewMode === "day" ? (
        <View style={{ flex: 1 }} onLayout={handleCalendarLayout}>
        <CalendarBindingProvider key="cal-day">
          <ResourceCalendarDayView
            dayData={dayDataForCanvas}
            // 2026-05-08: feed the chain detector from the week
            // window (gated by `hasStagedIntents`, see the weekQuery
            // wiring above) so the chip row's chain graph matches
            // what the Pending Reality review screen produces. The
            // prop is consumed ONLY for chain-graph derivation; the
            // calendar resource list still renders from `dayData`.
            // PR-UX-5: in Future mode `weekDataForCanvas` is the
            // projected world; the day view's chain hooks are also
            // suppressed by their own `useCalendarStore` read of
            // `futureMode`, so the chain detector's output is unused
            // when projecting — feeding the projected snapshot here
            // keeps the data flow internally consistent regardless.
            weekData={weekDataForCanvas}
            selectedDate={selectedDate}
            hourHeight={hourHeight}
            numberOfColumns={effectiveColumns}
            techOrder={techOrder}
            selectedTechIds={selectedTechIds}
            viewportHeight={calendarViewportH}
            onZoom={handleZoom}
            onEventPress={handleRCEventPress}
            onEventLongPress={handleRCEventLongPress}
            onBlockTap={handleRCBlockTap}
            onResourcePress={handleRCResourcePress}
            onResourceDoublePress={handleRCResourceDoublePress}
            onResourceReorder={handleRCResourceReorder}
            onDragEnd={handleRCDragEnd}
            chipRowBottomSlot={
              hasStagedIntents ? <NowFutureToggle /> : null
            }
          />
          <RCDragSubscription onDragEnd={handleRCDragEnd} />
        </CalendarBindingProvider>
        </View>
      ) : null}

      <SwapToast
        visible={!!swapToast}
        message={swapToast?.message ?? ""}
        detail={swapToast?.detail}
        onUndo={undoSwap}
        onEdit={swapToast?.editContext ? editCommitFromToast : undefined}
        onDismiss={dismissSwapToast}
      />

      {/* PLAN-DEVIATION: 2026-05-09-pr-ux-16-followups (PR-UX-16
          issues #4 + #5) — chain-to-chain conflict toast. Surfaces
          when two pending chain destinations land in the same
          calendar slot. Sets `auxHighlightedChainIds` for its
          lifetime so the calendar wrappers paint both conflicting
          chains' highlights / ghosts simultaneously even though
          the chip row's `selectedChainId` model only supports a
          single isolated chain. Uses `weekQuery.data` for the
          appointment input so the detector sees the same week-window
          projection the chain-graph hook uses (see
          `useMoveChainGraph` history note (c) for why the per-day
          fallback was retired).
          See docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-16-followups. */}
      <ChainToChainConflictToast
        appointments={chainToChainConflictAppointments}
        getConflictX={conflictXResolver}
      />

      {/* PR-UX-20: auto-promote clean-intent toast. The component
          self-gates on the detection hook (1-link clean intent +
          settings + suppression + snooze) so we mount it
          unconditionally — when nothing qualifies, it renders
          `null`. Geometry resolver mirrors the conflict toast's
          axis logic. */}
      <CleanIntentPromotionToast
        appointments={chainToChainConflictAppointments}
        getIntentDestX={cleanIntentDestXResolver}
        worldSnapshot={cleanIntentWorldSnapshot}
        technicianNames={cleanIntentDisplayLookups.technicianNames}
      />

      {/* P2-FE-5 chunk 2c (2026-04-22): quick-action toast — long-
          press router lands here. Kind-discriminated:
          - appointment → "Cancel appt" → CancelSheet
          - personalEvent → "Delete" → useDeletePersonalEvent
          Anchored to the same bottom slot as SwapToast — call
          sites enforce mutual exclusion. */}
      <EventQuickActionToast
        visible={!!quickActionToast}
        message={quickActionToast?.message ?? ""}
        detail={quickActionToast?.detail}
        action={
          quickActionToast?.kind === "personalEvent"
            ? {
                label: "Delete",
                accessibilityLabel: "Delete personal event",
                icon: "delete",
                onPress: () => handleQuickActionPersonalDelete(quickActionToast.personalEvent),
              }
            : {
                label: "Cancel appt",
                accessibilityLabel: "Cancel appointment",
                icon: "event-busy",
                onPress: () =>
                  quickActionToast?.kind === "appointment"
                  && handleQuickActionAppointmentCancel(quickActionToast.appointment),
              }
        }
        // PR 2.6 (2026-04-24) — extra pills:
        //  - appointment    → Edit, Quicktext (skip-to-detail-sheet
        //                      shortcuts; matches the row that exists
        //                      inside `AppointmentDetailSheet`).
        //  - personalEvent  → Edit only (no quicktext for personal
        //                      events — they have no customer).
        secondaryActions={
          quickActionToast?.kind === "personalEvent"
            ? [
                {
                  label: "Edit",
                  accessibilityLabel: "Edit personal event",
                  icon: "edit",
                  onPress: () => handleQuickActionPersonalEdit(quickActionToast.personalEvent),
                },
              ]
            : quickActionToast?.kind === "appointment"
              ? [
                  {
                    label: "Edit",
                    accessibilityLabel: "Edit appointment",
                    icon: "edit",
                    onPress: () => handleQuickActionAppointmentEdit(quickActionToast.appointment),
                  },
                  {
                    label: "Quicktext",
                    accessibilityLabel: "Send quicktext to customer",
                    icon: "chat",
                    onPress: () => handleQuickActionAppointmentQuicktext(quickActionToast.appointment),
                  },
                ]
              : undefined
        }
        onDismiss={dismissQuickActionToast}
      />

      {/*
        PR 2.4 (2026-04-24): rotate-back nudge mounted at the FO
        root so it overlays every calendar canvas. Visibility is
        driven entirely by `useRotateBackToastStore.show()` which
        the form sheets call on save success when their entry
        orientation was landscape (presentation="sideways").
      */}
      <RotateBackToast />

      {/*
        PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
        cross-card pending-move overlap notice. Mounted at the FO
        root alongside the rotate-back toast. Fires from
        `useSessionAwareSubmit` when an "Apply anyway" live-commit
        leaves another card's pending intent in conflict with the
        committed world. Non-blocking; auto-dismisses; routes to
        /pending-reality/review on "Adjust pending".
      */}
      <CrossCardCollisionToast />

      {/*
        P2-FE-5 (course-corrected 2026-04-21): the draft surface
        (tap-outside backdrop + chooser popover). Mounted at the FO
        root — OUTSIDE every orientation/view conditional — so the
        backdrop and popover survive rotation, view switches, and the
        `CalendarBindingProvider` remount that comes with them. The
        on-canvas dashed draft block itself is NOT rendered here; it's
        a synthetic event injected via `useResourcesWithDraft` inside
        each calendar wrapper. See deviation entries
        2026-04-21-tap-to-create-draft and
        2026-04-21-rotation-sideways-draft.
      */}
      <FloatingDraftCard
        onChooseKind={handleDraftChooserPick}
        techs={availableWorkweekTechs}
        onPickDraftTechnician={handleDraftPickTechnician}
      />

      {/* P3-FE-2: Pending Reality FAB. Self-gates on portrait + active
          intents — landscape mounts a HUD instead (P3-FE-3). */}
      <PendingRealityFAB />
      <PendingRealityDevShortcut />

      {activeSheet === "detail" && (
        <AppointmentDetailSheet
          ref={sheetRef}
          appointment={activeAppt}
          side={detailSheetSide}
          onClose={closeSheet}
          onReschedule={(a) => {
            const currentStart = buildDateTime(a.scheduled_date, a.scheduled_time, a.created_at);
            setRescheduleData({
              newStart: currentStart,
              newEnd: dayjs(currentStart).add(60, "minute").format("YYYY-MM-DDTHH:mm:ss"),
              newTechId: a.technician_id ?? undefined,
              newTechName: a.technician_name ?? undefined,
            });
            closeSheet();
            setTimeout(() => openSheet("reschedule", a), 250);
          }}
          onCancel={(a) => { closeSheet(); setTimeout(() => openSheet("cancel", a), 250); }}
          onQuickText={(a) => { closeSheet(); setTimeout(() => openSheet("quicktext", a), 250); }}
          onEdit={(a) => { closeSheet(); setTimeout(() => openSheet("form", a), 250); }}
        />
      )}
      {activeSheet === "form" && (
        <AppointmentFormSheet
          ref={sheetRef}
          editAppointment={!newSheetMode ? activeAppt : null}
          defaultDate={newApptDefaults.date ?? selectedDate}
          defaultStartTime={newApptDefaults.startTime}
          defaultTechnicianId={newApptDefaults.technicianId}
          onClose={closeSheet}
          // P3-FE-6: fire ONLY on save success (the form's
          // `closeAndClearCache` path) — dismisses the underlying
          // dashed pendingDraft block from the canvas. Implicit
          // close routes through `onClose` only and intentionally
          // leaves the draft alive so the user can re-tap it to
          // reopen the form with their typing intact.
          onSubmitted={dismissPendingDraft}
          // P2-FE-5 chunk 2 follow-up (2026-04-22): when the form opens
          // while the calendar is in landscape, present sideways so the
          // user is prompted to rotate to portrait before filling fields.
          // The sheet does NOT remount when this flips — the prop just
          // updates and the rotation transform / banner peel away.
          // See docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft.
          presentation={isLandscape ? "sideways" : "upright"}
          // P3-FE-6: cache key for the in-flight form state. Edit
          // mode is keyed by the appointment id; create mode is
          // keyed by the active pendingDraft id. If neither is
          // resolvable (e.g. "+" toolbar walk-in path with no
          // draft), `undefined` disables caching for this mount —
          // the sheet has no stable identity to attach typing to.
          // See docs/DEVELOPMENT-LOG.md#deferred-chunk-p3-fe-6.
          cacheKey={
            !newSheetMode && activeAppt
              ? sheetDraftCacheKey.appointment(activeAppt.id)
              : pendingDraftId
                ? sheetDraftCacheKey.draft(pendingDraftId)
                : undefined
          }
        />
      )}
      {activeSheet === "reschedule" && (
        <RescheduleSheet
          ref={sheetRef}
          appointment={activeAppt}
          newStartTime={rescheduleData.newStart}
          newEndTime={rescheduleData.newEnd}
          newTechnicianId={rescheduleData.newTechId}
          newTechnicianName={rescheduleData.newTechName}
          onClose={() => {
            closeSheet();
            setRescheduleData({});
          }}
          cacheKey={
            activeAppt ? sheetDraftCacheKey.reschedule(activeAppt.id) : undefined
          }
        />
      )}
      {activeSheet === "cancel" && (
        <CancelSheet
          ref={sheetRef}
          appointment={activeAppt}
          onClose={closeSheet}
          onFlexMatches={() => { closeSheet(); setTimeout(() => openSheet("flex"), 250); }}
          cacheKey={
            activeAppt ? sheetDraftCacheKey.cancel(activeAppt.id) : undefined
          }
          presentation={isLandscape ? "sideways" : "upright"}
        />
      )}
      {activeSheet === "personal" && (
        <PersonalEventFormSheet
          ref={sheetRef}
          event={editingPersonalEvent}
          defaultDate={newApptDefaults.date ?? selectedDate}
          defaultStartTime={newApptDefaults.startTime}
          defaultTechnicianId={newApptDefaults.technicianId}
          onClose={closeSheet}
          // P3-FE-6: see AppointmentFormSheet onSubmitted above —
          // fires only from the form's commit / delete success
          // branches, dismissing the dashed pendingDraft. Implicit
          // close preserves the draft + cache for re-tap restore.
          onSubmitted={dismissPendingDraft}
          presentation={isLandscape ? "sideways" : "upright"}
          cacheKey={
            editingPersonalEvent
              ? sheetDraftCacheKey.personalEvent(editingPersonalEvent.id)
              : pendingDraftId
                ? sheetDraftCacheKey.draft(pendingDraftId)
                : undefined
          }
        />
      )}
      {activeSheet === "chooser" && (
        <EventTypeChooserSheet
          ref={sheetRef}
          contextLabel={chooserContextLabel}
          onChoose={handleChooserPick}
          onClose={closeSheet}
        />
      )}
      {activeSheet === "quicktext" && activeAppt && (
        <QuickTextSheet
          ref={sheetRef}
          appointmentId={activeAppt.id}
          customerName={activeAppt.customer_name}
          onClose={closeSheet}
        />
      )}
      {activeSheet === "generate" && (
        <GenerateAppointmentSheet
          ref={sheetRef}
          onClose={closeSheet}
          cacheKey={sheetDraftCacheKey.generate()}
        />
      )}
      {activeSheet === "flex" && (
        <FlexListSheet ref={sheetRef} onClose={closeSheet} />
      )}
      {activeSheet === "quick-settings" && (
        <CalendarQuickSettingsSheet ref={sheetRef} onClose={closeSheet} />
      )}
      {/*
        Linter-intercept sheet (P3-FE-7). Mounted ONCE at the
        franchise calendar tab level; subscribes to the
        `useLinterInterceptHost` store and opens whenever the
        producer (`useSessionAwareSubmit`) calls `present(issues)`.
        Stays in the tree even when no intercept is active —
        collapses to null.
        PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width —
        the half-width side-pinned popup pattern reads its X
        anchor from `linterInterceptXResolver` (calendar-tab
        local) so the popup pins to the side OPPOSITE the
        conflicting tile, matching the `ChainToChainConflictToast`
        positioning model.
      */}
      <LinterInterceptSheet getInterceptX={linterInterceptXResolver} />
      </CollapsibleTopProvider>
    </GestureHandlerRootView>
  );
}

// ── Technician Calendar ─────────────────────────────────────────

type TechViewMode = "route" | "day" | "week";

function TechnicianCalendar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const currentLocation = useCurrentLocation();
  const { selectedDate, showMap, calendarDensity } = useCalendarStore();
  // Tech calendar has no landscape variant in v1 (master plan §5.1 is
  // Franchise-Owner-only). Calling `useCalendarTabOrientation` with
  // `enabled: false` is a no-op now — left in place so the focus/blur
  // seam already exists when a tech-side landscape canvas lands.
  useCalendarTabOrientation({ enabled: false });
  // FORK Phase 28.2-logging companion (P3-FE-DRAG-GHOST follow-up,
  // 2026-05-06): the technician calendar is portrait-only today, but
  // every `[CAL:*]` console.log in this component is prefixed with
  // `calTag(viewMode, isLandscape)` for symmetry with FranchiseOwner-
  // Calendar — when a tech-side landscape canvas lands the only
  // change needed here will be replacing this `false` with the live
  // orientation value.
  const isLandscape = false;
  const [viewMode, setViewMode] = useState<TechViewMode>("route");
  const techDefaultHourHeight = getDensityHourHeight(calendarDensity);
  const [techHourHeight, setTechHourHeight] = useState(techDefaultHourHeight);
  useEffect(() => {
    setTechHourHeight(techDefaultHourHeight);
  }, [techDefaultHourHeight]);
  const handleTechZoom = useCallback(
    (newHeight: number) => {
      const clamped = Math.max(20, Math.min(techDefaultHourHeight, Math.round(newHeight)));
      if (clamped !== techHourHeight) {
        setTechHourHeight(clamped);
      }
    },
    [techHourHeight, techDefaultHourHeight],
  );

  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const techId = user?.userId ?? 0;
  const techName = user?.fullName ?? "";

  const { data: certStanding } = useCertificationStanding();
  const dailyBriefing = useDailyBriefing(today);
  const briefingSummary = useMemo(() => {
    const b = dailyBriefing.data;
    if (!b) return { materialIssueCount: 0, alertCount: 0, subtitle: "Materials, route, and alerts for today" };
    const materialIssueCount = (b.material_requirements ?? []).filter(
      (m) => !m.in_stock || m.current_stock < m.quantity_needed,
    ).length;
    const alertCount = b.alerts?.length ?? 0;
    const totalIssues = materialIssueCount + alertCount;
    const subtitle = totalIssues > 0
      ? [materialIssueCount > 0 && `${materialIssueCount} part${materialIssueCount !== 1 ? "s" : ""} need attention`, alertCount > 0 && `${alertCount} alert${alertCount !== 1 ? "s" : ""}`].filter(Boolean).join(", ")
      : "All clear — materials, route, and alerts";
    return { materialIssueCount, alertCount, subtitle };
  }, [dailyBriefing.data]);

  const workweekStartDate = useMemo(() => {
    const d = dayjs(selectedDate);
    const dow = d.day();
    const monday = dow === 0 ? d.subtract(6, "day") : d.subtract(dow - 1, "day");
    return monday.format("YYYY-MM-DD");
  }, [selectedDate]);

  const routeQuery = useTodayRoute();
  const weekQuery = useTechnicianWeekView(
    viewMode === "week" ? workweekStartDate : ""
  );
  const selectedDateRoute = useRouteByDate(viewMode === "week" && showMap ? selectedDate : "");
  const arriveAtStop = useArriveAtStop();
  const departStop = useDepartStop();

  const dayQuery = useTechnicianDayView(viewMode === "day" ? selectedDate : "");

  // ── Unified primary-sheet state ────────────────────────────────
  // Earlier this used four separate `Open` flags + four separate refs
  // (chooser/personal/appt/quickSettings). That allowed two sheets to
  // mount at once during the chooser→form handoff, and gorhom's
  // BottomSheet got into a state where snapToIndex(0) on the second
  // sheet was a no-op every other time (the user saw "every other
  // pick of Personal/Customer does nothing"). Switching to a single
  // shared ref + an enum mirrors the franchise side and guarantees
  // only one primary sheet is ever mounted, which kills the race.
  type TechPrimarySheet = "chooser" | "personal" | "appt" | "quickSettings" | null;
  const [activeTechSheet, setActiveTechSheet] = useState<TechPrimarySheet>(null);
  const techPrimarySheetRef = useRef<AppSheetRef>(null);

  const [personalDefaults, setPersonalDefaults] = useState<{ date?: string; startTime?: string }>({});
  // Customer-appointment form sheet (tech variant). Reuses the franchise
  // AppointmentFormSheet — the create mutation is role-aware and the
  // backend forces technician_id = self for tech-side calls.
  const [apptDefaults, setApptDefaults] = useState<{ date?: string; startTime?: string; technicianId?: number }>({});
  const [chooserDraft, setChooserDraft] = useState<{ date: string; startTime: string } | null>(null);

  // Retry snap helper. Bottom-sheet refs attach during React's commit
  // phase, so a setTimeout(0) snap right after setState often fires
  // before the ref is live -- the sheet stays at index=-1 (invisible)
  // and the user has to long-press again. Polling for up to ~1s with a
  // short backoff matches the franchise side and eliminates the
  // "every other time" race when transitioning between sheets (e.g.
  // chooser -> form).
  const trySnapTechSheet = useCallback((label: string, attempt = 0) => {
    if (techPrimarySheetRef.current) {
      techPrimarySheetRef.current.snapToIndex(0);
      return;
    }
    if (attempt >= 24) {
      console.warn(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tech-sheet] gave up snapping", label, "after 24 attempts");
      return;
    }
    setTimeout(() => trySnapTechSheet(label, attempt + 1), 40);
  }, []);

  const openTechSheet = useCallback((type: Exclude<TechPrimarySheet, null>) => {
    setActiveTechSheet(type);
    // Form sheets now mount with index={0} so they auto-open. The
    // snap call below is a belt-and-suspenders safety net for sheets
    // that mount with index={-1} (e.g. legacy mounts) -- harmless
    // no-op once the sheet is already at index 0.
    setTimeout(() => trySnapTechSheet(type), 0);
  }, [trySnapTechSheet]);

  const closeTechSheet = useCallback(() => {
    techPrimarySheetRef.current?.close();
    // Unmount after the close animation so the next sheet (if any)
    // can claim the shared ref cleanly.
    setTimeout(() => {
      setActiveTechSheet(null);
    }, 200);
  }, []);

  const openTechQuickSettings = useCallback(() => {
    openTechSheet("quickSettings");
  }, [openTechSheet]);

  const openPersonalSheet = useCallback((defaults?: { date?: string; startTime?: string }) => {
    setPersonalDefaults(defaults ?? {});
    openTechSheet("personal");
  }, [openTechSheet]);

  const openApptSheet = useCallback((defaults: { date?: string; startTime?: string; technicianId?: number }) => {
    setApptDefaults(defaults);
    openTechSheet("appt");
  }, [openTechSheet]);

  const openChooserFromDraft = useCallback((draft: DraggedEventDraft) => {
    const dateStr = (typeof draft.date === "string" && draft.date.length >= 10)
      ? draft.date
      : dayjs(selectedDate).format("YYYY-MM-DD");
    const fromMin = Math.round(Math.max(RC_WORK_START, Math.min(draft.from, RC_WORK_END)));
    const timeStr = dayjs(minutesToIso(dateStr, fromMin)).format("HH:mm");
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] tech release -> opening chooser", { dateStr, timeStr });
    haptic.medium();
    setChooserDraft({ date: dateStr, startTime: timeStr });
    openTechSheet("chooser");
  }, [selectedDate, openTechSheet]);

  const handleTechChooserPick = useCallback((choice: "customer" | "personal") => {
    const draft = chooserDraft;
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:chooser] pick (tech)", { choice, hasDraft: !!draft });
    // Close the chooser first (animates down + unmounts at +200ms) so
    // the shared ref fully detaches before the next sheet mounts.
    // Hot-swapping the ref in a single render (chooser -> appt) leaves
    // gorhom in a weird state where snapToIndex(0) is a no-op; going
    // chooser -> null -> form gives the bottom-sheet a clean lifecycle
    // and matches the franchise-side pattern that works reliably.
    closeTechSheet();
    if (!draft) return;
    setTimeout(() => {
      if (choice === "customer") {
        setApptDefaults({ date: draft.date, startTime: draft.startTime, technicianId: user?.userId });
        openTechSheet("appt");
      } else {
        setPersonalDefaults({ date: draft.date, startTime: draft.startTime });
        openTechSheet("personal");
      }
      setChooserDraft(null);
    }, 250);
  }, [chooserDraft, closeTechSheet, openTechSheet, user?.userId]);

  const techChooserContextLabel = useMemo(() => {
    if (!chooserDraft) return undefined;
    const m = dayjs(`${chooserDraft.date}T${chooserDraft.startTime}:00`);
    if (!m.isValid()) return undefined;
    const isToday = dayjs().format("YYYY-MM-DD") === chooserDraft.date;
    const dateLabel = isToday ? "Today" : m.format("ddd, MMM D");
    return `${dateLabel} · ${m.format("h:mm A")}`;
  }, [chooserDraft]);

  // P2-FE-5 (course-corrected 2026-04-21): pending-draft store wires
  // for the technician calendar. Mirrors the FO setup above.
  const techCreatePendingDraft = useCalendarStore((s) => s.createDraft);
  const techUpdatePendingDraft = useCalendarStore((s) => s.updateDraft);
  const setDraftTechnicianAction = useCalendarStore((s) => s.setDraftTechnician);
  const techDismissPendingDraft = useCalendarStore((s) => s.dismissDraft);
  const techSetDraftChooserOpen = useCalendarStore((s) => s.setDraftChooserOpen);
  // P3-FE-6: mirror the FO `pendingDraftId` selector — tech sheet
  // mounts use it to derive a stable `cacheKey` for the in-flight
  // form so an implicit close preserves the typing.
  const techPendingDraftId = useCalendarStore(
    (s) => s.pendingDraft?.draftId ?? null,
  );

  const handleTechEventPress = useCallback((event: RCEvent) => {
    // P2-FE-5: tap on synthetic draft block opens the chooser popover.
    if (isDraftSyntheticEventId(event.id)) {
      haptic.light();
      techSetDraftChooserOpen(true);
      return;
    }
    // P2-FE-5: tapping a real event while a draft exists dismisses
    // the draft and proceeds (one gesture).
    if (useCalendarStore.getState().pendingDraft) {
      techDismissPendingDraft();
    }
    // PLAN-DEVIATION: 2026-04-21-tech-personal-event-tap-blocked —
    // techs can SEE personal events on their column (they're rendered
    // by the tech-side calendar mount via `aggregateEventsForTech`)
    // but tapping them is a no-op. The franchise-side gained a full
    // edit + delete flow in this chunk; the tech-side intentionally
    // did NOT. See docs/PLAN-DEVIATIONS.md#2026-04-21-tech-personal-event-tap-blocked
    // for the full rationale (tech personal-event ownership, share
    // membership, and quick-action toast scope are all open
    // questions; resolving them needs a UX pass we deferred to keep
    // P2-FE-5 shippable).
    if (isPersonalEvent(event)) return;
    const appt = getAppointmentFromEvent(event);
    if (appt) {
      // PLAN-DEVIATION: 2026-04-27-pending-tap-to-detail-sheet —
      // tech-side mirrors the FO-side revert. Tapping a pending
      // appointment now goes to the order detail (the canonical
      // tech-side destination) instead of /pending-reality/review.
      // The technician's read-only view of pending changes lives on
      // the order detail screen and the Pending Reality tab, both
      // of which are reachable without hijacking the calendar tap.
      // See docs/PLAN-DEVIATIONS.md#2026-04-27-pending-tap-to-detail-sheet.
      haptic.light();
      router.push(`/order/${appt.id}`);
    }
  }, [router, techSetDraftChooserOpen, techDismissPendingDraft]);

  const handleTechBlockTap = useCallback((resource: RCResource, date: Date) => {
    const dateStr = dayjs(date).format("YYYY-MM-DD");
    const startMinutes = date.getHours() * 60 + date.getMinutes();
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:tap] tech blockTap → createDraft", {
      dateStr,
      startMinutes,
      technicianId: resource.id,
    });
    haptic.light();
    techCreatePendingDraft({
      date: dateStr,
      startMinutes,
      technicianId: resource.id,
    });
  }, [techCreatePendingDraft]);

  // P2-FE-5 chunk 2b/2c: tech-side long-press router. Drafts dismiss
  // (free dismiss path); real events are a no-op + haptic for now.
  // Chunk 2c shipped the quick-action Cancel toast on the FO side
  // only — the tech app is a viewer of assignments and rarely
  // originates a cancellation, so the toast doesn't earn its weight
  // here yet. Revisit if dispatch ops on the tech device become a
  // real workflow.
  const handleTechEventLongPress = useCallback((event: RCEvent) => {
    console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:longPress] tech", { id: event.id, isDraft: isDraftSyntheticEventId(event.id) });
    if (isDraftSyntheticEventId(event.id)) {
      haptic.medium();
      techDismissPendingDraft();
      return;
    }
    haptic.medium();
  }, [techDismissPendingDraft]);

  // P2-FE-8 — tech-side embedded avatar selector. The tech calendar
  // only ever has one tech (the logged-in user), so the selector
  // would normally be a single-chip row. We still wire it for
  // consistency with the FO mount and so an unexpected null-tech
  // draft (e.g. a future flow that calls `createDraft` without a
  // technicianId) has a recovery path.
  const techSelfTechs = useMemo<EmbeddedAvatarSelectorTech[]>(() => {
    if (!user) return [];
    return [
      {
        id: user.userId,
        name: user.fullName,
        profileImageUrl: user.profileImageUrl ?? null,
      },
    ];
  }, [user]);

  const handleTechDraftPickTechnician = useCallback(
    (techId: number) => {
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] tech embedded selector pick", { techId });
      setDraftTechnicianAction(techId);
    },
    [setDraftTechnicianAction],
  );

  // 2026-04-21 race fix (mirror of franchise-side fix): receive the
  // draft as an argument from FloatingDraftCard rather than re-reading
  // the store at execution time. See the franchise-side
  // `handleDraftChooserPick` for the long-form rationale.
  const handleTechDraftChooserPick = useCallback(
    (kind: "customer" | "personal", draft: PendingDraft) => {
      const startTime = dayjs(minutesToIso(draft.date, draft.startMinutes)).format("HH:mm");
      console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] tech chooser pick → opening form", { kind, startTime });
      // P3-FE-6: see the franchise-side `handleDraftChooserPick` for
      // the long-form rationale — defer dismissPendingDraft until the
      // form's `onSubmitted` fires (save success / cancel) so an
      // implicit close preserves the dashed block and the cached
      // typing for re-tap → restore.
      haptic.medium();
      if (kind === "customer") {
        setApptDefaults({
          date: draft.date,
          startTime,
          technicianId: draft.technicianId ?? user?.userId,
        });
        openTechSheet("appt");
      } else {
        setPersonalDefaults({ date: draft.date, startTime });
        openTechSheet("personal");
      }
    },
    [openTechSheet, user?.userId],
  );

  // ── Week view drag-to-reschedule ──────────────────────────────
  const [techRescheduleSheet, setTechRescheduleSheet] = useState(false);
  const techSheetRef = useRef<AppSheetRef>(null);
  const [techActiveAppt, setTechActiveAppt] = useState<CalendarAppointmentItem | null>(null);
  const [techRescheduleData, setTechRescheduleData] = useState<{
    newStart?: string; newEnd?: string; newTechId?: number; newTechName?: string;
  }>({});
  const techLastDragRef = useRef<{ sig: string; ts: number } | null>(null);

  const handleTechDragEnd = useCallback((draft: DraggedEventDraft) => {
    try {
      if (!draft.event) return;
      // P2-FE-5: drag-to-move on the tech-side synthetic draft block.
      if (isDraftSyntheticEventId(draft.event.id)) {
        const dateStr = (typeof draft.date === "string" && draft.date.length >= 10)
          ? draft.date
          : dayjs(selectedDate).format("YYYY-MM-DD");
        // 2026-05-06: duration-preserving clamp — see helper above.
        const { from: fromMin, to: toMin } = clampDragRangeToWorkWindow(
          draft.from,
          draft.to,
          draft.event.from,
          draft.event.to,
        );
        const technicianId = typeof draft.resourceId === "number" ? draft.resourceId : null;
        console.log(`[${calTag(viewMode, isLandscape)}]`, "[CAL:draft] tech drag-to-move → updateDraft", {
          dateStr,
          fromMin,
          duration: toMin - fromMin,
          technicianId,
        });
        techUpdatePendingDraft({
          date: dateStr,
          startMinutes: fromMin,
          durationMinutes: toMin - fromMin,
          technicianId,
        });
        return;
      }
      if (isDraftEvent(draft.event)) {
        // Legacy long-press flow (kept for backwards compat — see
        // 2026-04-21-tap-to-create-draft deviation).
        openChooserFromDraft(draft);
        return;
      }
      const appt = getAppointmentFromEvent(draft.event);
      if (!appt) return;

      const rawFrom = draft.from;
      const rawTo = draft.to;
      const rawDate = draft.date;

      const from = Number.isFinite(rawFrom) ? rawFrom : draft.event.from;
      const to = Number.isFinite(rawTo) ? rawTo : draft.event.to;
      const date = (typeof rawDate === "string" && rawDate.length >= 10) ? rawDate : selectedDate;

      // 2026-05-06: duration-preserving clamp — see helper above.
      const { from: clampedFrom, to: clampedTo } = clampDragRangeToWorkWindow(
        from,
        to,
        draft.event.from,
        draft.event.to,
      );

      const newStart = minutesToIso(date, clampedFrom);
      const newEnd = minutesToIso(date, clampedTo);

      if (!dayjs(newStart).isValid() || !dayjs(newEnd).isValid()) return;

      const sig = `${appt.id}|${newStart}|${newEnd}`;
      const now = Date.now();
      if (techLastDragRef.current?.sig === sig && now - techLastDragRef.current.ts < 600) return;
      techLastDragRef.current = { sig, ts: now };

      haptic.medium();
      setTechRescheduleData({ newStart, newEnd, newTechId: techId, newTechName: techName });
      setTechActiveAppt(appt);
      setTimeout(() => {
        setTechRescheduleSheet(true);
        setTimeout(() => techSheetRef.current?.snapToIndex(0), 50);
      }, 250);
    } catch (err) {
      console.error("[TECH DRAG] error", err);
    }
  }, [selectedDate, techId, techName, openChooserFromDraft, techUpdatePendingDraft]);

  const closeTechRescheduleSheet = useCallback(() => {
    techSheetRef.current?.close();
    setTimeout(() => {
      setTechRescheduleSheet(false);
      setTechRescheduleData({});
    }, 200);
  }, []);

  // ── Loading state ─────────────────────────────────────────────
  const isRouteLoading = routeQuery.isLoading;
  const isWeekLoading = weekQuery.isLoading;
  const isRefetching = viewMode === "route" ? routeQuery.isRefetching : false;
  const refetch = viewMode === "route" ? routeQuery.refetch : routeQuery.refetch;

  if (viewMode === "route" && isRouteLoading && !routeQuery.isRefetching) return <SkeletonListScreen />;

  // PR-UX-6 (2026-05-08 follow-up): the technician calendar mounts
  // `<CollapsibleTop>` too, so it also needs the SV provider above
  // so the chrome can subscribe to the same shared collapse-progress
  // value. The technician route doesn't render an avatar strip
  // (single-tech surface), so no other consumer reads from the
  // provider here — but `<CollapsibleTop>`'s own `useCollapseProgress`
  // assertion requires it to exist. See
  // docs/PLAN-DEVIATIONS.md#2026-05-08-avatar-strip-bbox-derivation.
  return (
    <GestureHandlerRootView style={styles.container}>
      <CollapsibleTopProvider>
      <CollapsibleTop>
        <DailyBriefingBanner
          alertCount={briefingSummary.materialIssueCount + briefingSummary.alertCount}
          subtitle={briefingSummary.subtitle}
          onPress={() => router.push("/briefing")}
        />

        {certStanding && certStanding.status !== "good" && certStanding.required_training.length > 0 && (
          <Pressable
            style={styles.trainingAlertBanner}
            onPress={() => { haptic.light(); router.push("/training"); }}
          >
            <MaterialIcons name="school" size={20} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.trainingAlertTitle}>
                New required training assigned
              </Text>
              <Text style={styles.trainingAlertReason} numberOfLines={2}>
                {certStanding.required_training[0].reason}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </Pressable>
        )}

        <View style={styles.toggleRow}>
          {(["route", "day", "week"] as TechViewMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.toggleBtn, viewMode === m && styles.toggleActive]}
              onPress={() => {
                haptic.light();
                setViewMode(m);
                if (m === "day") useCalendarStore.getState().setSelectedDate(today);
              }}
            >
              <Text style={[styles.toggleText, viewMode === m && styles.toggleTextActive]}>
                {m === "route" ? "Route" : m === "day" ? "Today" : "Week"}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.mapToggle, showMap && styles.mapToggleActive]}
            onPress={() => { haptic.light(); useCalendarStore.getState().toggleMap(); }}
          >
            <MaterialIcons name={showMap ? "view-list" : "map"} size={20} color={showMap ? "#fff" : "#3B82F6"} />
          </Pressable>
          <Pressable
            style={[styles.densityBtn, calendarDensity !== "none" && styles.densityBtnActive]}
            onPress={() => { haptic.light(); useCalendarStore.getState().toggleDensity(); }}
          >
            <MaterialIcons
              name={(
                { none: "open-in-full", height: "unfold-less", width: "view-column", both: "compress" } as Record<string, string>
              )[calendarDensity] as any}
              size={20}
              color={calendarDensity !== "none" ? "#fff" : "#3B82F6"}
            />
          </Pressable>
          <Pressable
            style={styles.addEventBtn}
            onPress={() => { haptic.light(); openPersonalSheet(); }}
          >
            <MaterialIcons name="add" size={20} color="#3B82F6" />
          </Pressable>
          <Pressable
            style={styles.addEventBtn}
            onPress={openTechQuickSettings}
            accessibilityLabel="Calendar quick settings"
          >
            <MaterialIcons name="tune" size={20} color="#3B82F6" />
          </Pressable>
        </View>
      </CollapsibleTop>

      {viewMode === "day" ? (
        dayQuery.isLoading ? (
          <SkeletonListScreen />
        ) : (
          <CalendarBindingProvider>
            <ResourceCalendarDayView
              dayData={dayQuery.data}
              selectedDate={selectedDate}
              hourHeight={techHourHeight}
              numberOfColumns={1}
              onZoom={handleTechZoom}
              onEventPress={handleTechEventPress}
              onEventLongPress={handleTechEventLongPress}
              onBlockTap={handleTechBlockTap}
            />
            <RCDragSubscription onDragEnd={handleTechDragEnd} />
          </CalendarBindingProvider>
        )
      ) : viewMode === "route" ? (
        routeQuery.data ? (
          showMap ? (
            <RouteMapView route={routeQuery.data} technicianLocation={currentLocation} />
          ) : (
            <RouteTimeline
              route={routeQuery.data}
              onStopPress={(stop: RouteStopWithDetails) => router.push(`/order/${stop.appointment_id}`)}
              onStockPress={(stop: RouteStopWithDetails) => router.push(`/job/${stop.appointment_id}/briefing`)}
              onArrive={(stopId: number) => arriveAtStop.mutate(stopId)}
              onDepart={(stopId: number) => departStop.mutate(stopId)}
              onContinueJob={(appointmentId: number, serviceNames: string | null) => {
                // PLAN-DEVIATION: 2026-04-26-resume-direct-route — see docs/PLAN-DEVIATIONS.md.
                // Round-4 routed Resume Job through /briefing on the assumption
                // briefing's status check would catch in-progress jobs. It doesn't:
                // starting a service updates the *service* row to in_progress, not
                // the appointment row, so the briefing redirect never fires. We
                // now short-circuit at the CTA when the active-timer Zustand store
                // points at this appointment, bypassing briefing entirely.
                const activeTimer = useActiveTimerStore.getState();
                if (
                  activeTimer.isRunning &&
                  activeTimer.jobId === appointmentId
                ) {
                  router.push(`/job/${appointmentId}/timer`);
                  return;
                }
                useJobFlowStore.getState().setScheduledServiceNames(serviceNames);
                router.push(`/job/${appointmentId}/briefing`);
              }}
              isRefreshing={isRefetching}
              onRefresh={refetch}
            />
          )
        ) : (
          <EmptyState icon="route" title="No route today" subtitle="No optimized route has been created for today." onAction={() => router.push("/job/new/confirm-vehicle" as never)} actionLabel="Start Walk-in Job" />
        )
      ) : isWeekLoading ? (
        <SkeletonListScreen />
      ) : showMap && selectedDateRoute.data ? (
        <RouteMapView route={selectedDateRoute.data} technicianLocation={undefined} />
      ) : (
        <CalendarBindingProvider>
          <ResourceCalendarWorkweekView
            weekData={Array.isArray(weekQuery.data) ? weekQuery.data : undefined}
            techId={techId}
            techName={techName}
            workweekStartDate={workweekStartDate}
            hourHeight={techHourHeight}
            onEventPress={handleTechEventPress}
            onEventLongPress={handleTechEventLongPress}
            onBlockTap={handleTechBlockTap}
            onBackPress={() => setViewMode("day")}
            onPrevWeek={() => useCalendarStore.getState().goToPreviousWeek()}
            onNextWeek={() => useCalendarStore.getState().goToNextWeek()}
          />
          <RCDragSubscription onDragEnd={handleTechDragEnd} />
        </CalendarBindingProvider>
      )}

      {/*
        P2-FE-5 (course-corrected 2026-04-21): draft surface for the
        technician calendar. Mounted at the tech root so backdrop +
        chooser survive route/view switches. See deviation
        2026-04-21-tap-to-create-draft.
      */}
      <FloatingDraftCard
        onChooseKind={handleTechDraftChooserPick}
        techs={techSelfTechs}
        onPickDraftTechnician={handleTechDraftPickTechnician}
      />

      {/* P3-FE-2: Pending Reality FAB on the tech calendar. The tech
          calendar has no landscape variant in v1 (master plan §5.1),
          so the FAB's portrait gate is effectively always-on here. */}
      <PendingRealityFAB />
      <PendingRealityDevShortcut />

      {activeTechSheet === "personal" && (
        <PersonalEventFormSheet
          ref={techPrimarySheetRef}
          defaultDate={personalDefaults.date ?? selectedDate}
          defaultStartTime={personalDefaults.startTime}
          onClose={closeTechSheet}
          // P3-FE-6: see the FO mount above for the contract.
          onSubmitted={techDismissPendingDraft}
          cacheKey={
            techPendingDraftId
              ? sheetDraftCacheKey.draft(techPendingDraftId)
              : undefined
          }
        />
      )}

      {techRescheduleSheet && (
        <RescheduleSheet
          ref={techSheetRef}
          appointment={techActiveAppt}
          newStartTime={techRescheduleData.newStart}
          newEndTime={techRescheduleData.newEnd}
          newTechnicianId={techRescheduleData.newTechId}
          newTechnicianName={techRescheduleData.newTechName}
          onClose={closeTechRescheduleSheet}
          isTechnician
        />
      )}

      {activeTechSheet === "quickSettings" && (
        <CalendarQuickSettingsSheet
          ref={techPrimarySheetRef}
          onClose={closeTechSheet}
        />
      )}

      {activeTechSheet === "appt" && (
        <AppointmentFormSheet
          ref={techPrimarySheetRef}
          editAppointment={null}
          defaultDate={apptDefaults.date ?? selectedDate}
          defaultStartTime={apptDefaults.startTime}
          defaultTechnicianId={apptDefaults.technicianId}
          onClose={closeTechSheet}
          // P3-FE-6: see the FO mount above for the contract.
          onSubmitted={techDismissPendingDraft}
          cacheKey={
            techPendingDraftId
              ? sheetDraftCacheKey.draft(techPendingDraftId)
              : undefined
          }
        />
      )}

      {activeTechSheet === "chooser" && (
        <EventTypeChooserSheet
          ref={techPrimarySheetRef}
          contextLabel={techChooserContextLabel}
          onChoose={handleTechChooserPick}
          onClose={closeTechSheet}
        />
      )}
      {/* Linter-intercept sheet (P3-FE-7) — see franchise mount above.
          The tech-side mount currently passes no positioner; the
          tech canvas doesn't expose the same chain/appointment
          projection the franchise resolver consumes, and a real
          tech-side resolver is a separate follow-up. With no
          positioner the sheet falls back to a right-side
          half-width default — still better than the prior
          full-width bottom drawer covering the conflict tile. */}
      <LinterInterceptSheet />

      {/*
        PR 2.4 (2026-04-24): rotate-back nudge mounted at the tech
        root too — see franchise mount above for the rationale.
      */}
      <RotateBackToast />

      {/*
        PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
        cross-card pending-move overlap notice. Mounted at the tech
        root too — see franchise mount above for the rationale.
      */}
      <CrossCardCollisionToast />
      </CollapsibleTopProvider>
    </GestureHandlerRootView>
  );
}

// ── Shared Components ───────────────────────────────────────────

function EmptyState({ icon, title, subtitle, onAction, actionLabel }: { icon: string; title: string; subtitle: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <View style={styles.empty}>
      <MaterialIcons name={icon as any} size={56} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtext}>{subtitle}</Text>
      {onAction && actionLabel && (
        <Pressable style={styles.walkInBtn} onPress={onAction}>
          <Text style={styles.walkInText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Root Screen ─────────────────────────────────────────────────

export default function CalendarScreen() {
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === UserRole.FRANCHISE_OWNER;
  return isFranchiseOwner ? <FranchiseOwnerCalendar /> : <TechnicianCalendar />;
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  trainingAlertBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 12, marginBottom: 4, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: "#FEF2F2", borderRadius: 14, borderWidth: 1, borderColor: "#FECACA",
  },
  trainingAlertTitle: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
  trainingAlertReason: { fontSize: 11, color: "#991B1B", marginTop: 1 },
  collapseHandleRow: {
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    gap: 6,
  },
  collapseHandlePill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  collapseHandleChevron: {
    marginLeft: 2,
  },
  toggleRow: { flexDirection: "row", padding: 12, gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center" },
  toggleActive: { backgroundColor: "#3B82F6" },
  toggleText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  toggleTextActive: { color: "#fff" },
  mapToggle: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DBEAFE" },
  mapToggleActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  densityBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DBEAFE" },
  densityBtnActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
  addEventBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DBEAFE" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151" },
  emptySubtext: { fontSize: 15, color: "#9CA3AF", textAlign: "center", paddingHorizontal: 32 },
  walkInBtn: { marginTop: 16, backgroundColor: "#3B82F6", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 10 },
  walkInText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
