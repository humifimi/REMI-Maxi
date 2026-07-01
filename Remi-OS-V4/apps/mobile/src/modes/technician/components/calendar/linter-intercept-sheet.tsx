// PLAN-DEVIATION: 2026-04-24-smart-default-intent-producer
//   — this sheet is the consumer half of the smart-default linter
//   intercept; the producer side is `useSessionAwareSubmit`. The
//   master plan §5.3.3 originally sketched an explicit "Stage" CTA
//   on every form sheet OR a session-mode toggle; the user
//   explicitly rejected both during the C.9 design pass. See
//   docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer
//   before proposing CTA / mode-toggle alternatives.
//
// PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width
//   — in LANDSCAPE, this surface renders as a HALF-WIDTH BottomSheet
//   that rises from the bottom of the screen, pinned to the half of
//   the calendar OPPOSITE the conflicting slot. The user explicitly
//   asked for this on 2026-05-10: "have them come up vertically from
//   the bottom of the screen, like the [AppointmentDetailSheet]
//   drawer does." The X-axis pinning still uses `useDynamicPopupSide`
//   to determine which half of the screen to occupy; the entry /
//   exit animation now belongs to the gorhom BottomSheet (rises
//   from the bottom of the half-width wrapper) instead of the prior
//   custom translateX side-slide. The aa2d078 → 2026-05-10 history
//   went: full-width bottom drawer (legacy) → half-width side-slide
//   (aa2d078) → half-width BottomSheet (this revision).
//
//   In PORTRAIT, the original `@gorhom/bottom-sheet` full-width
//   bottom-drawer is retained — half-width on a portrait phone
//   viewport leaves too little room for the conflict copy + edge
//   cards, which wraps badly. Portrait keeps the full-width
//   drawer; landscape gets the half-width drawer. The carve-out is
//   documented at
//   docs/PLAN-DEVIATIONS.md#2026-05-10-linter-intercept-half-width.
/**
 * `LinterInterceptSheet` (P3-FE-7) — the smart-default linter
 * intercept surface presented when a live calendar mutation's
 * proposed change has at least one local linter issue.
 *
 * Mounted ONCE at the calendar tab level (`app/(tabs)/index.tsx`),
 * subscribes to `useLinterInterceptHost` for its open/close state,
 * and dispatches the user's choice back through the host store's
 * `resolveActive(...)` action. The producer side
 * (`useSessionAwareSubmit`) `await`s the host's `present(issues)`
 * Promise; this sheet is the consumer half that resolves it.
 *
 * Rendering (orientation-aware, post-2026-05-10 smoke fix):
 *   - **Landscape:** half-width Animated.View pinned to the side of
 *     the calendar OPPOSITE the conflicting slot via
 *     `useDynamicPopupSide`. Mirrors the
 *     `ChainToChainConflictToast` pattern (PR-UX-19) so the linter
 *     intercept and the chain-to-chain notice share the same
 *     "informational drawer doesn't cover the conflict" surface.
 *     Optional `getInterceptX(request, viewportWidth)` prop returns
 *     the X coordinate of the conflicting slot on the calendar
 *     canvas. `null` returns fall back to a right-side default
 *     (still half-width). Backdrop tap on the calendar half
 *     OPPOSITE the popup dismisses with `undefined`.
 *   - **Portrait:** `@gorhom/bottom-sheet` bottom-drawer with
 *     `snapPoints: ["55%", "85%"]`, `enablePanDownToClose`. Same
 *     `LinterEdgeCard` body, same Apply / Stage buttons.
 *
 * The "Apply anyway" button is intentionally secondary (white
 * background, neutral text) and "Stage for review" is primary
 * (blue background, white text). The user picked the smart-default
 * intercept over an explicit "Stage" CTA precisely because they
 * trust the linter's judgment more than their own in-the-moment
 * intuition; the visual hierarchy reinforces that. See
 * docs/PLAN-DEVIATIONS.md#2026-04-23-smart-default-intent-producer
 * for the design rationale.
 *
 * ESC / backdrop tap resolves to `undefined`. The producer
 * interprets that as "drop the live mutation; canvas snaps back
 * to its pre-mutation position." For drag callsites the snap-back
 * has already happened (the producer ordering runs the linter
 * BEFORE the live mutation, so the canvas never moved); for form-
 * sheet callsites the dismiss simply means the form sheet stays
 * open and the user can edit further.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
// LDM-WAVE-2 CHUNK-2 follow-up: this file maintains a parallel landscape
// Animated.View path (with custom translateX) that needs structural
// unification with AppSheet's wrapper. Tracked as a Wave-2 follow-up
// sub-chunk because the reconciliation is larger than the rest of the
// sweep combined. See landscape-dispatch-map-wave-2.md §CHUNK-2.
// eslint-disable-next-line no-restricted-imports
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { TouchableOpacity } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinterEdgeCard } from "@technician/components/linter/linter-edge-card";
import { useCalendarDisplayLookups } from "@technician/hooks/schedule/use-calendar-display-lookups";
import { useDynamicPopupSide } from "@technician/hooks/ui/use-dynamic-popup-side";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";
import { haptic } from "@technician/hooks/utility/use-haptics";
import {
  useLinterInterceptHost,
  type LinterInterceptRequest,
} from "@technician/stores/linter-intercept-host";
import type { LinterIssue } from "@technician/utils/logistics-linter";
import {
  captureCalendarAnomaly,
  traceCalendar,
} from "@technician/utils/sentry-diagnostics";

/**
 * 2026-05-13 — render-pipeline instrumentation. Confirmed via Sentry
 * session replay (replay 52ca9ae128d4409a9f597e16e7cd6d8f) that for
 * drop A in each "every other" pair, the host store's `present(...)`
 * is called and `request` is set (eviction log fires when drop B
 * starts), BUT the BottomSheet does not visually animate open. The
 * indirect signals (request != null in Zustand) say the sheet should
 * be open; the screen pixels say it isn't. These breadcrumbs and
 * watchdog event close the gap by emitting from the actual render +
 * gorhom-animation lifecycle so we can tell whether the sheet ever
 * truly tries to animate, ever lays out non-zero, etc.
 */
const SHEET_OPEN_WATCHDOG_MS = 600;

/**
 * 2026-05-12 blank-drawer-on-rotate fix — how long we keep the
 * BottomSheet mounted AFTER `request` clears so gorhom's close
 * animation can play out. Long enough to cover the 250ms default
 * close timing + a small safety margin; short enough that an
 * orientation flip after this window finds zero phantom drawers.
 */
const SHEET_UNMOUNT_DELAY_MS = 300;

interface LinterInterceptSheetProps {
  /**
   * PLAN-DEVIATION: 2026-05-10-linter-intercept-half-width — given
   * the active intercept request and the current viewport width,
   * return the X coord (0 = left edge, `viewportWidth` = right
   * edge) of the conflicting slot on the calendar canvas, or `null`
   * when the consumer can't (yet) resolve a position. Returning
   * `null` falls the popup back to a right-side default (still
   * half-width).
   *
   * Only consumed in LANDSCAPE — portrait renders the original
   * bottom-drawer chrome and ignores this prop.
   *
   * The consumer owns the request→x mapping because the math
   * differs by view mode (landscape workweek uses the date axis;
   * portrait day uses the tech-column axis), matching the existing
   * `ChainToChainConflictToast` / `CleanIntentPromotionToast`
   * positioner pattern. Mounts in `app/(tabs)/index.tsx` thread
   * `linterInterceptXResolver` here.
   */
  getInterceptX?: (
    request: LinterInterceptRequest,
    viewportWidth: number,
  ) => number | null;
}

// ── Shared filter / display helpers ────────────────────────────────

/**
 * PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
 * when every displayed issue is intra-session pending-move overlap
 * (`time_conflict` + `collisionWith === "staged_intent"`), the sheet
 * uses a softer eyebrow / title / subtitle: the user already owns
 * both sides of the conflict, nothing on the committed calendar is
 * at risk, and "Stage for review" is a reasonable thing to do on
 * purpose (e.g. drag-imprecise placement that the user plans to
 * fine-tune via resize / edit). The urgent red framing
 * ("Hold on — this would conflict.") stays for committed-world
 * conflicts (R2) and for mixed cases.
 * See docs/PLAN-DEVIATIONS.md#2026-05-12-pending-move-overlap-soft-framing.
 */
export type DisplayedIssueMix = "pending-only" | "committed-or-mixed";

/**
 * Exported for unit testing — not meant for external consumption.
 * See `__tests__/linter-intercept-sheet-copy.test.ts`.
 */
export function classifyIssueMix(
  issues: readonly LinterIssue[],
): DisplayedIssueMix {
  if (issues.length === 0) return "committed-or-mixed";
  for (const issue of issues) {
    // Any issue that is NOT a pending-move overlap → use the urgent
    // framing. That covers committed-world time_conflict (R2) AND
    // every non-`time_conflict` kind (drive_time, sla, fleet,
    // recurring) — those don't carry `collisionWith`, but they're
    // not pending-move overlap by definition.
    if (
      issue.kind !== "time_conflict" ||
      issue.collisionWith !== "staged_intent"
    ) {
      return "committed-or-mixed";
    }
  }
  return "pending-only";
}

/**
 * PLAN-DEVIATION: 2026-05-11-clean-drops-stale-intercept — the
 * `filtered.length === 0` branch below renders an empty list instead
 * of falling back to the unfiltered list. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-11-clean-drops-stale-intercept`.
 *
 * Filter the host store's full linter issue list down to "rows that
 * touch the dragged card / its chain", per
 * `request.scopeAppointmentIds`.
 *
 * - `null`/`undefined` scope → render every issue (legacy fallback,
 *   covers callsites that don't yet plumb a target id).
 * - Non-null scope → render only issues whose
 *   `affectedAppointmentIds` intersects the scope set.
 * - Filter result is empty AND there are issues → render the empty
 *   list and log a `__DEV__` warning. Pre-2026-05-11 this branch
 *   fell back to the unfiltered list "defensively", but that
 *   defense exposed exactly the bug it claimed to prevent:
 *   when a clean drop slipped past the producer's old session-wide
 *   intercept decision, the sheet opened with stale conflicts on
 *   other cards in scope, and this fallback then showed the user
 *   "Hold on — this would conflict." over rows they never touched.
 *   The producer
 *   (`useSessionAwareSubmit`, 2026-05-11 fix) now scope-filters
 *   the issue list BEFORE the live-commit-vs-intercept decision,
 *   so the sheet should never receive a scope-non-empty request
 *   whose issues fail the scope filter. If that invariant ever
 *   breaks, we'd rather render an empty conflict surface (a clear
 *   bug) than misleading conflicts on cards the user didn't touch.
 *
 * See `docs/PLAN-DEVIATIONS.md#2026-05-11-clean-drops-stale-intercept`.
 */
function useDisplayedIssues(
  request: LinterInterceptRequest | null,
): LinterIssue[] {
  return useMemo(() => {
    if (!request) return [];
    const all = request.issues;
    const scope = request.scopeAppointmentIds;
    if (scope == null || scope.size === 0) {
      if (__DEV__ && scope != null && scope.size === 0) {
        console.warn(
          "[LinterInterceptSheet] empty scope set; falling back to unfiltered list",
          { issueCount: all.length, requestId: request.id },
        );
      }
      return all;
    }
    const filtered = all.filter((issue) =>
      issue.affectedAppointmentIds.some((id) => scope.has(id)),
    );
    if (filtered.length === 0 && __DEV__) {
      console.warn(
        "[LinterInterceptSheet] scope filter removed every issue; rendering empty list (producer should have live-committed instead of opening sheet)",
        {
          requestId: request.id,
          issueCount: all.length,
          scopeIds: Array.from(scope),
        },
      );
    }
    return filtered;
  }, [request]);
}

/**
 * Mounted once at the calendar tab level. Stays in the tree even
 * when no intercept is active (`request === null`) — both branches
 * collapse cheaply when no request is open.
 *
 * Branches on viewport orientation:
 *   - landscape → `LinterInterceptSheetLandscape` (half-width side-
 *     pinned popup, the post-aa2d078 surface).
 *   - portrait  → `LinterInterceptSheetPortrait` (bottom-drawer,
 *     the pre-aa2d078 surface).
 *
 * The branches are real component boundaries (rather than a
 * conditional render inside one component) so each branch's hooks
 * are stable across re-renders within that orientation. Rotation
 * unmounts one and mounts the other; the host store request
 * survives because it's owned by Zustand, so an in-flight intercept
 * carries through a rotation.
 */
export function LinterInterceptSheet({
  getInterceptX,
}: LinterInterceptSheetProps = {}) {
  const { orientation } = useWideCanvas();
  if (orientation === "landscape") {
    return <LinterInterceptSheetLandscape getInterceptX={getInterceptX} />;
  }
  return <LinterInterceptSheetPortrait />;
}

// ───────────────────────────────────────────────────────────────────
// Landscape branch — half-width BottomSheet (rises from bottom).
//
// Mirrors the AppointmentDetailSheet half-width-bottom-sheet pattern
// (`PLAN-DEVIATION: 2026-04-22-half-width-detail-sheet`). The
// BottomSheet renders inside a positioned half-width wrapper; the
// gorhom library's own slide-up animation is anchored to the
// wrapper's bottom edge, giving the user the exact "drawer from
// the bottom" feel they asked for on 2026-05-10.
// ───────────────────────────────────────────────────────────────────

/**
 * Exported for direct testing. Production callers should always
 * import the orientation-aware `LinterInterceptSheet` host component
 * above; this export is only here so Jest can render the landscape
 * branch without standing up a viewport mock that the
 * `useWideCanvas`-internal `useWindowDimensions()` capture wouldn't
 * see anyway.
 */
export function LinterInterceptSheetLandscape({
  getInterceptX,
}: LinterInterceptSheetProps) {
  const request = useLinterInterceptHost((s) => s.request);
  const resolveActive = useLinterInterceptHost((s) => s.resolveActive);
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ["55%", "85%"], []);

  // 2026-05-12 blank-drawer-on-rotate fix — `shouldRender` controls
  // whether the BottomSheet (and its half-width wrapper) lives in
  // the React tree at all. Without this, gorhom's BottomSheet stays
  // mounted at `index={-1}` permanently, and on an orientation flip
  // (this branch unmounting + remounting, or the portrait branch
  // taking over) we've observed it surfacing as a blank drawer:
  // background + handle visible, no content (the 2026-05-11
  // phantom-sheet fix gated CONTENT on `request != null`, but the
  // drawer shell itself was still presenting). Gating the whole
  // BottomSheet on `shouldRender` keeps the drawer shell out of the
  // tree when there's no active intercept, so even gorhom's stalest
  // Reanimated worklet has nothing to surface.
  //
  // We delay unmount by `SHEET_UNMOUNT_DELAY_MS` after `request`
  // clears so the normal close animation (Stage / Apply / pan-down
  // / backdrop tap) can play out before the BottomSheet disappears
  // from the tree. Inside that window, an orientation flip still
  // unmounts the branch normally (React handles that), but the
  // window is short enough that the user doesn't notice a stray
  // drawer mid-rotation.
  // See docs/PLAN-DEVIATIONS.md#2026-05-12-blank-drawer-on-rotate.
  const [shouldRender, setShouldRender] = useState<boolean>(request != null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 2026-05-13 watchdog — see matching note in portrait branch.
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sawOpenAnimateForRequestRef = useRef<number | null>(null);
  const lastAnimateRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    traceCalendar("LinterInterceptSheetLandscape MOUNT", {
      initialShouldRender: request != null,
      initialRequestId: request?.id ?? null,
    });
    return () => {
      traceCalendar("LinterInterceptSheetLandscape UNMOUNT");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open / close the BottomSheet whenever a request appears /
  // clears. Mirrors the portrait branch — the sheet's own pan-down
  // / backdrop tap calls `handleDismiss` which clears the request,
  // so the two stay one-way coupled.
  useEffect(() => {
    if (request) {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      setShouldRender(true);
      traceCalendar("LinterInterceptSheetLandscape open path (effect 1)", {
        requestId: request.id,
        issueCount: request.issues.length,
        sheetRefAttached: sheetRef.current != null,
      });
      if (__DEV__) {
        console.log("[DEBUG:LinterInterceptSheet] opening for request", {
          requestId: request.id,
          issueCount: request.issues.length,
          scopeSize: request.scopeAppointmentIds?.size ?? null,
          orientation: "landscape",
        });
      }
      // The declarative `index` prop drives the open animation now;
      // no imperative snapToIndex needed.

      const armedRequestId = request.id;
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = setTimeout(() => {
        const sawOpen =
          sawOpenAnimateForRequestRef.current === armedRequestId;
        if (!sawOpen) {
          captureCalendarAnomaly(
            "intercept-sheet-never-opened (landscape)",
            {
              requestId: armedRequestId,
              orientation: "landscape",
              shouldRender,
              sheetRefAttached: sheetRef.current != null,
              lastAnimateFrom: lastAnimateRef.current?.from ?? null,
              lastAnimateTo: lastAnimateRef.current?.to ?? null,
              watchdogMs: SHEET_OPEN_WATCHDOG_MS,
            },
            { issueCount: request.issues.length },
          );
        }
      }, SHEET_OPEN_WATCHDOG_MS);
    } else {
      if (__DEV__) {
        console.log("[DEBUG:LinterInterceptSheet] closing (no active request)");
      }
      traceCalendar("LinterInterceptSheetLandscape close path (effect 1)");
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      sawOpenAnimateForRequestRef.current = null;
      sheetRef.current?.close();
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = setTimeout(() => {
        setShouldRender(false);
        unmountTimerRef.current = null;
      }, SHEET_UNMOUNT_DELAY_MS);
    }
    return () => {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // 2026-05-13 — the imperative `snapToIndex` post-mount effect was
  // removed when the BottomSheet's `index` prop went declarative.
  // gorhom now reads `index={request != null ? 0 : -1}` directly off
  // the JSX, so React+Reanimated handle the open animation without
  // us having to coordinate ref attachment with effect ordering.

  const handleAnimateLandscape = useCallback(
    (fromIndex: number, toIndex: number) => {
      lastAnimateRef.current = { from: fromIndex, to: toIndex };
      const activeRequestId =
        useLinterInterceptHost.getState().request?.id ?? null;
      if (toIndex >= 0 && activeRequestId != null) {
        sawOpenAnimateForRequestRef.current = activeRequestId;
      }
      traceCalendar("BottomSheet onAnimate (landscape)", {
        fromIndex,
        toIndex,
        activeRequestId,
      });
    },
    [],
  );

  const handleApply = useCallback(() => {
    if (__DEV__) {
      console.log("[DEBUG:LinterInterceptSheet] tap → Apply anyway");
    }
    haptic.light();
    resolveActive("apply");
  }, [resolveActive]);

  const handleStage = useCallback(() => {
    if (__DEV__) {
      console.log("[DEBUG:LinterInterceptSheet] tap → Stage for review");
    }
    haptic.medium();
    resolveActive("stage");
  }, [resolveActive]);

  const handleDismiss = useCallback(() => {
    // Only resolve if there's still an active request — useEffect's
    // close-when-cleared branch can fire `onClose` after we've
    // already resolved via a button tap.
    if (useLinterInterceptHost.getState().request) {
      resolveActive(undefined);
    }
  }, [resolveActive]);

  const displayedIssues = useDisplayedIssues(request);
  const errorCount = displayedIssues.filter(
    (i) => i.severity === "error",
  ).length;
  const warningCount = displayedIssues.length - errorCount;
  const issueMix = useMemo(
    () => classifyIssueMix(displayedIssues),
    [displayedIssues],
  );
  const header = useMemo(
    () => buildSheetHeader(issueMix, errorCount, warningCount),
    [issueMix, errorCount, warningCount],
  );
  const displayLookups = useCalendarDisplayLookups();

  // ── Geometry / dynamic side positioning ─────────────────────────
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const interceptX = useMemo<number | null>(() => {
    if (!request) return null;
    if (!getInterceptX) return null;
    const x = getInterceptX(request, windowWidth);
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  }, [request, getInterceptX, windowWidth]);

  const { wrapperStyle } = useDynamicPopupSide({
    conflictX: interceptX,
    viewportWidth: windowWidth,
  });

  // No-X fallback (consumer didn't supply / couldn't resolve a
  // position) — render at right-side half-width so the sheet stays
  // useful even in views that haven't plumbed a positioner. Same
  // pattern as `ChainToChainConflictToast`'s fallback.
  const fallbackWrapper: ViewStyle = {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: insets.right,
    width: Math.max(Math.round(windowWidth * 0.5) - insets.right, 200),
  };
  const resolvedWrapperStyle = wrapperStyle ?? fallbackWrapper;

  // PLAN-DEVIATION: 2026-05-12-blank-drawer-on-rotate — return
  // `null` entirely (no wrapper, no BottomSheet) when there's no
  // active intercept request AND the post-close grace window has
  // elapsed (`shouldRender === false`). The 2026-05-11 phantom-
  // sheet-on-rotate fix gated CONTENT on `request != null` — that
  // stopped the title + Stage / Apply buttons from re-appearing
  // post-rotation, but the BottomSheet's drawer shell (background
  // + handle) still rose to the surface, producing a "blank drawer
  // pops up on rotation" UX bug. Unmounting the whole BottomSheet
  // when `shouldRender` is false removes the shell entirely so
  // there's nothing for gorhom's stale worklet state to surface.
  // The deferred unmount via `SHEET_UNMOUNT_DELAY_MS` preserves the
  // close animation for the normal open/close cycle within a single
  // orientation. See docs/PLAN-DEVIATIONS.md#2026-05-12-blank-drawer-on-rotate.
  if (!shouldRender) return null;
  // 2026-05-13 — declarative `index` prop, same fix as portrait
  // branch. Driving `index` from `request != null` reliably triggers
  // gorhom's open animation; the prior imperative snapToIndex was
  // silently dropping in production (proven by sheet-never-opened
  // watchdog).
  return (
    <View
      style={resolvedWrapperStyle}
      pointerEvents="box-none"
      testID="linter-intercept-sheet"
    >
      <BottomSheet
        ref={sheetRef}
        index={request != null ? 0 : -1}
        animateOnMount
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={handleDismiss}
        onAnimate={handleAnimateLandscape}
        backgroundStyle={portraitStyles.sheetBg}
        handleIndicatorStyle={portraitStyles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={portraitStyles.content}>
          {request != null ? (
            <>
              <View style={portraitStyles.header}>
                <Text
                  style={[portraitStyles.eyebrow, { color: header.eyebrowColor }]}
                  accessibilityRole="text"
                  testID="linter-intercept-eyebrow"
                >
                  {header.eyebrow}
                </Text>
                <Text style={portraitStyles.title} testID="linter-intercept-title">
                  {header.title}
                </Text>
                <Text style={portraitStyles.subtitle}>{header.subtitle}</Text>
              </View>

              <View style={portraitStyles.cardStack}>
                {displayedIssues.map((issue, idx) => (
                  <LinterEdgeCard
                    key={`${issue.kind}-${idx}`}
                    issue={issue}
                    showKindLabel
                    displayLookups={displayLookups}
                  />
                ))}
              </View>

              <View style={portraitStyles.footer}>
                <TouchableOpacity
                  style={portraitStyles.secondaryBtn}
                  onPress={handleApply}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Apply anyway"
                  testID="linter-intercept-apply-btn"
                >
                  <Text style={portraitStyles.secondaryText}>Apply anyway</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={portraitStyles.primaryBtn}
                  onPress={handleStage}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Stage for review"
                  testID="linter-intercept-stage-btn"
                >
                  <Text style={portraitStyles.primaryText}>Stage for review</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Portrait branch — `@gorhom/bottom-sheet` bottom-drawer (pre-aa2d078).
// ───────────────────────────────────────────────────────────────────

/**
 * Exported for direct testing. See the matching note on
 * `LinterInterceptSheetLandscape`.
 */
export function LinterInterceptSheetPortrait() {
  const request = useLinterInterceptHost((s) => s.request);
  const resolveActive = useLinterInterceptHost((s) => s.resolveActive);
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ["55%", "85%"], []);

  // 2026-05-12 blank-drawer-on-rotate fix — see matching note in
  // `LinterInterceptSheetLandscape`. Same gate: don't render the
  // BottomSheet at all when there's no active intercept (and the
  // close animation has had a chance to play). This keeps the
  // drawer shell out of the tree so an orientation flip can't
  // surface a blank drawer in either direction.
  // See docs/PLAN-DEVIATIONS.md#2026-05-12-blank-drawer-on-rotate.
  const [shouldRender, setShouldRender] = useState<boolean>(request != null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 2026-05-13 — sheet-never-opened watchdog. We fire a high-signal
  // Sentry capture event when `request` has been non-null for
  // SHEET_OPEN_WATCHDOG_MS without `onAnimate(-1, 0)` ever firing.
  // That would prove the bug the user keeps reporting: store says
  // sheet is open, screen pixels say it isn't.
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sawOpenAnimateForRequestRef = useRef<number | null>(null);
  const lastAnimateRef = useRef<{ from: number; to: number } | null>(null);
  const lastLayoutRef = useRef<{ width: number; height: number } | null>(null);

  // Mount/unmount breadcrumbs.
  useEffect(() => {
    traceCalendar("LinterInterceptSheetPortrait MOUNT", {
      initialShouldRender: request != null,
      initialRequestId: request?.id ?? null,
    });
    return () => {
      traceCalendar("LinterInterceptSheetPortrait UNMOUNT");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render breadcrumb on every render with the resolved render-time
  // signals so we can tell render vs effect ordering apart.
  useEffect(() => {
    traceCalendar("LinterInterceptSheetPortrait render", {
      requestId: request?.id ?? null,
      shouldRender,
      sheetRefAttached: sheetRef.current != null,
      sawOpenAnimate: sawOpenAnimateForRequestRef.current,
      lastAnimateFrom: lastAnimateRef.current?.from ?? null,
      lastAnimateTo: lastAnimateRef.current?.to ?? null,
      lastLayoutWidth: lastLayoutRef.current?.width ?? null,
      lastLayoutHeight: lastLayoutRef.current?.height ?? null,
    });
  });

  // Open the sheet whenever a request appears, close it whenever
  // the request clears. The sheet's own `onClose` (pan-down or
  // backdrop tap) calls `resolveActive(undefined)` which sets
  // `request = null`, so closing the sheet and clearing the
  // request stay one-way coupled.
  useEffect(() => {
    if (request) {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      setShouldRender(true);
      traceCalendar("LinterInterceptSheetPortrait open path (effect 1)", {
        requestId: request.id,
        issueCount: request.issues.length,
        scopeSize: request.scopeAppointmentIds?.size ?? null,
        sheetRefAttached: sheetRef.current != null,
        shouldRenderBeforeSet: shouldRender,
      });
      if (__DEV__) {
        console.log("[DEBUG:LinterInterceptSheet] opening for request", {
          requestId: request.id,
          issueCount: request.issues.length,
          scopeSize: request.scopeAppointmentIds?.size ?? null,
          orientation: "portrait",
        });
      }
      // The declarative `index` prop drives the open animation now;
      // no imperative snapToIndex needed.

      // Arm the watchdog. If onAnimate(-1, 0) doesn't fire within
      // SHEET_OPEN_WATCHDOG_MS, the sheet did not visually open.
      const armedRequestId = request.id;
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = setTimeout(() => {
        const sawOpen =
          sawOpenAnimateForRequestRef.current === armedRequestId;
        if (!sawOpen) {
          captureCalendarAnomaly(
            "intercept-sheet-never-opened (portrait)",
            {
              requestId: armedRequestId,
              orientation: "portrait",
              shouldRender,
              sheetRefAttached: sheetRef.current != null,
              lastAnimateFrom: lastAnimateRef.current?.from ?? null,
              lastAnimateTo: lastAnimateRef.current?.to ?? null,
              lastLayoutWidth: lastLayoutRef.current?.width ?? null,
              lastLayoutHeight: lastLayoutRef.current?.height ?? null,
              watchdogMs: SHEET_OPEN_WATCHDOG_MS,
            },
            {
              issueCount: request.issues.length,
              scopeAppointmentIds:
                request.scopeAppointmentIds == null
                  ? null
                  : Array.from(request.scopeAppointmentIds),
            },
          );
        }
      }, SHEET_OPEN_WATCHDOG_MS);
    } else {
      if (__DEV__) {
        console.log("[DEBUG:LinterInterceptSheet] closing (no active request)");
      }
      traceCalendar("LinterInterceptSheetPortrait close path (effect 1)", {
        sheetRefAttached: sheetRef.current != null,
        shouldRenderBeforeSet: shouldRender,
      });
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      sawOpenAnimateForRequestRef.current = null;
      sheetRef.current?.close();
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = setTimeout(() => {
        setShouldRender(false);
        unmountTimerRef.current = null;
      }, SHEET_UNMOUNT_DELAY_MS);
    }
    return () => {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
    // shouldRender intentionally excluded — we only want this
    // effect to react to `request` transitions; including
    // `shouldRender` would re-arm the watchdog every time the
    // mount gate flips and double-count anomalies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // 2026-05-13 — the imperative `snapToIndex` post-mount effect was
  // removed when the BottomSheet's `index` prop went declarative.
  // See the matching note in `LinterInterceptSheetLandscape`.

  const handleAnimate = useCallback(
    (fromIndex: number, toIndex: number) => {
      lastAnimateRef.current = { from: fromIndex, to: toIndex };
      const activeRequestId =
        useLinterInterceptHost.getState().request?.id ?? null;
      if (toIndex >= 0 && activeRequestId != null) {
        sawOpenAnimateForRequestRef.current = activeRequestId;
      }
      traceCalendar("BottomSheet onAnimate (portrait)", {
        fromIndex,
        toIndex,
        activeRequestId,
      });
    },
    [],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    lastLayoutRef.current = { width, height };
    const activeRequestId =
      useLinterInterceptHost.getState().request?.id ?? null;
    traceCalendar("BottomSheet onLayout (portrait)", {
      width,
      height,
      activeRequestId,
    });
  }, []);

  const handleApply = () => {
    if (__DEV__) {
      console.log("[DEBUG:LinterInterceptSheet] tap → Apply anyway");
    }
    haptic.light();
    resolveActive("apply");
  };

  const handleStage = () => {
    if (__DEV__) {
      console.log("[DEBUG:LinterInterceptSheet] tap → Stage for review");
    }
    haptic.medium();
    resolveActive("stage");
  };

  const handleDismiss = () => {
    // Only resolve if there's still an active request — useEffect's
    // close-when-cleared branch can fire `onClose` after we've
    // already resolved via a button tap.
    if (useLinterInterceptHost.getState().request) {
      resolveActive(undefined);
    }
  };

  const displayedIssues = useDisplayedIssues(request);
  const errorCount = displayedIssues.filter(
    (i) => i.severity === "error",
  ).length;
  const warningCount = displayedIssues.length - errorCount;
  const issueMix = useMemo(
    () => classifyIssueMix(displayedIssues),
    [displayedIssues],
  );
  const header = useMemo(
    () => buildSheetHeader(issueMix, errorCount, warningCount),
    [issueMix, errorCount, warningCount],
  );
  const displayLookups = useCalendarDisplayLookups();

  // PLAN-DEVIATION: 2026-05-12-blank-drawer-on-rotate — return
  // `null` when there's no active intercept AND the close-animation
  // grace window has elapsed. See the matching note in
  // `LinterInterceptSheetLandscape` for the full rationale (the
  // 2026-05-11 children-only gate left the drawer shell visible
  // post-rotation; unmounting the whole BottomSheet removes the
  // shell entirely). See
  // docs/PLAN-DEVIATIONS.md#2026-05-12-blank-drawer-on-rotate.
  if (!shouldRender) return null;
  // 2026-05-13 — declarative `index` prop. The previous pattern used
  // `index={-1}` plus an imperative `sheetRef.current.snapToIndex(0)`
  // call in a useEffect; Sentry watchdog data
  // (`intercept-sheet-never-opened`, lastAnimateFrom/To both null,
  // sheetRefAttached true, layout reported 393×569) showed gorhom
  // never started the open animation when snapToIndex was called
  // synchronously after mount. Driving `index` from `request != null`
  // is the idiomatic gorhom path: prop change → reanimated worklet
  // picks it up → onAnimate fires → sheet opens.
  return (
    <BottomSheet
      ref={sheetRef}
      index={request != null ? 0 : -1}
      animateOnMount
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleDismiss}
      onAnimate={handleAnimate}
      onChange={(idx) => {
        traceCalendar("BottomSheet onChange (portrait)", {
          newIndex: idx,
          activeRequestId:
            useLinterInterceptHost.getState().request?.id ?? null,
        });
      }}
      backgroundStyle={portraitStyles.sheetBg}
      handleIndicatorStyle={portraitStyles.sheetHandle}
      containerStyle={{ zIndex: 1000 }}
    >
      <View
        onLayout={handleLayout}
        style={{ flex: 1 }}
        pointerEvents="box-none"
      >
      <BottomSheetScrollView contentContainerStyle={portraitStyles.content}>
        {request != null ? (
          <>
            <View style={portraitStyles.header}>
              <Text
                style={[portraitStyles.eyebrow, { color: header.eyebrowColor }]}
                accessibilityRole="text"
                testID="linter-intercept-eyebrow"
              >
                {header.eyebrow}
              </Text>
              <Text style={portraitStyles.title} testID="linter-intercept-title">
                {header.title}
              </Text>
              <Text style={portraitStyles.subtitle}>{header.subtitle}</Text>
            </View>

            <View style={portraitStyles.cardStack}>
              {displayedIssues.map((issue, idx) => (
                <LinterEdgeCard
                  key={`${issue.kind}-${idx}`}
                  issue={issue}
                  showKindLabel
                  displayLookups={displayLookups}
                />
              ))}
            </View>

            <View style={portraitStyles.footer}>
              <TouchableOpacity
                style={portraitStyles.secondaryBtn}
                onPress={handleApply}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Apply anyway"
                testID="linter-intercept-apply-btn"
              >
                <Text style={portraitStyles.secondaryText}>Apply anyway</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={portraitStyles.primaryBtn}
                onPress={handleStage}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Stage for review"
                testID="linter-intercept-stage-btn"
              >
                <Text style={portraitStyles.primaryText}>Stage for review</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </BottomSheetScrollView>
      </View>
    </BottomSheet>
  );
}

function summarizeCounts(errors: number, warnings: number): string {
  if (errors > 0 && warnings > 0) {
    return `${pluralize(errors, "error")} and ${pluralize(warnings, "warning")} found`;
  }
  if (errors > 0) {
    return `${pluralize(errors, "error")} found`;
  }
  if (warnings > 0) {
    return `${pluralize(warnings, "warning")} found`;
  }
  return "Issues found";
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Header copy for the sheet, branched on the issue mix. The
 * `pending-only` case uses a softer eyebrow / title / subtitle so
 * the user reads "heads up, you already have a pending move here"
 * instead of "stop, the calendar is broken." Stage-for-review is a
 * legitimate workflow when the user wants two cards stacked in the
 * same time band so they can resize/edit later (drag-and-drop
 * precision is imperfect by design). The committed-or-mixed case
 * keeps the original red framing.
 *
 * Exported for unit testing — see
 * `__tests__/linter-intercept-sheet-copy.test.ts`.
 */
export function buildSheetHeader(
  mix: DisplayedIssueMix,
  errorCount: number,
  warningCount: number,
): { eyebrow: string; eyebrowColor: string; title: string; subtitle: string } {
  if (mix === "pending-only") {
    const total = errorCount + warningCount;
    return {
      eyebrow: "Pending move overlap",
      eyebrowColor: "#B45309", // amber-700 — softer than the committed-conflict red
      title: "This would overlap a pending move.",
      subtitle:
        total === 1
          ? "Another change you've staged this session covers the same time band."
          : `${total} other changes you've staged this session cover this time band.`,
    };
  }
  return {
    eyebrow: "Conflict notice",
    eyebrowColor: "#DC2626", // red-600 — unchanged from pre-2026-05-12
    title: "Hold on — this would conflict.",
    subtitle: summarizeCounts(errorCount, warningCount),
  };
}

// 2026-05-10 user fix: the landscape `landscapeStyles` block (custom
// translateX-animated card) was removed when the landscape branch
// converted to the half-width BottomSheet pattern (see
// `LinterInterceptSheetLandscape` above and `PLAN-DEVIATION:
// 2026-05-10-linter-intercept-half-width`). Both orientations now
// render through `portraitStyles`; the landscape variant just
// wraps the BottomSheet in a positioned half-width parent.

const portraitStyles = StyleSheet.create({
  sheetBg: {
    backgroundColor: "#F9FAFB",
  },
  sheetHandle: {
    backgroundColor: "#D1D5DB",
    width: 40,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    paddingVertical: 8,
    gap: 4,
  },
  eyebrow: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  cardStack: {
    gap: 10,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
