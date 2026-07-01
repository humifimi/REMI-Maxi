/**
 * `PendingRealityHUD` — landscape equivalent of `PendingRealityFAB`
 * (P3-FE-3, master plan §5.2.2 + chunk prompt C.4 in §8.8). Same
 * data, different chrome.
 *
 * Shape: a horizontally-elongated 44pt pill with a count badge in
 * the top-right corner and a glyph + numeric count inside. The pill
 * is anchored to the corner OPPOSITE the avatar strip — i.e. on the
 * SAME edge as `MapToggleButton`, vertically stacked **below** the
 * map toggle handle. The two corner-of-opposite-edge controls
 * coexist as a small vertical column near the top of the screen
 * (status-bar inset + the map toggle handle's height + a small
 * gap) so the bottom corner stays free for the multi-tech rendering
 * picker (see §5.1.4 / `landscape-multi-tech-tab`).
 *
 * Chrome accounting (master plan §5.1.1):
 *   - Map toggle (top corner, opposite avatar strip) — exception #1.
 *   - Pending Reality HUD (just below map toggle, same edge)      — exception #2.
 *
 * The 56pt FAB is portrait-only (the FAB hides itself in landscape;
 * see `PendingRealityFAB.tsx`). The HUD takes its place as the
 * landscape entry point into `/pending-reality/review`.
 *
 * Coloring + badge rules mirror the FAB exactly:
 *   - clean (no linter issues)  → green  (`StatusColors.finalized`)
 *   - one or more warnings only → yellow (`StatusColors.scheduled`)
 *   - one or more errors        → red    (`StatusColors.paymentDue`)
 *
 * Subscriptions use slice selectors so a session-row refresh
 * (e.g. `policy_snapshot` realtime ping) does not re-render the HUD
 * unless the visible count or worst-severity actually changed.
 *
 * Visibility:
 *   - Renders nothing when no intents are staged. See PLAN-DEVIATION
 *     marker below for why we deliberately do NOT also surface
 *     `useCalendarStore.pendingDraft` here.
 *   - Caller (`LandscapeWorkweekView`) only mounts the HUD in
 *     landscape — there is no internal orientation gate (the FAB
 *     gates itself because it lives on the portrait/landscape root,
 *     but the HUD is mounted exclusively from the landscape view).
 *
 * Tap → routes to `/pending-reality/review` (the dual-mode review
 * surface lands in P3-FE-4; until then the route resolves to the
 * placeholder shipped with P3-FE-2).
 */

// PLAN-DEVIATION: 2026-04-23-pending-reality-trim — the chunk-C.4
// step "branch on `intents.length > 0 || heldDraft != null` to
// render-or-null" is implemented as `intents.length > 0` only.
// `heldDraft` no longer exists on `usePendingRealityStore` (the
// rotation-resilience window was retired by
// 2026-04-21-rotation-sideways-draft). The "preserve cognitive
// work" surface that replaced it lives on
// `useCalendarStore.pendingDraft` and is already painted on the
// landscape calendar canvas as a dashed synthetic event by
// `useResourcesWithDraft` — surfacing it again behind the HUD
// would be duplicative chrome for state the user can already see,
// and conflating it with the Pending Reality session count would
// re-couple the two stores that the trim deliberately separated.
// See docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim.

// PLAN-DEVIATION: 2026-04-23-pending-reality-hud-opposite-edge —
// master plan §5.2.2 spec'd the HUD as "a 44pt slot at the bottom
// of the avatar strip" (i.e. on the SAME edge as the strip).
// Chunk prompt C.4 (§8.8) overrides this and places the HUD on
// the OPPOSITE edge, stacked under `MapToggleButton`. We follow
// the chunk prompt because (a) it is the more recent spec, (b)
// keeping all "I want to leave the canvas" controls on one edge
// preserves the avatar strip as a pure tech-filter surface, and
// (c) the §5.1.1 ASCII diagram already labels both bottom-corner
// controls as the two surviving chrome elements. See
// docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-hud-opposite-edge.

import { useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { StatusColors } from "@technician/constants/colors";
import {
  getOppositeEdge,
  useAccessibilityStore,
  type PreferredHand,
} from "@technician/stores/accessibility";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { PENDING_REALITY_REVIEW_ROUTE } from "@technician/constants/pending-reality-routes";
import {
  useDraggableHud,
  type HudCorner,
} from "@technician/hooks/landscape/use-draggable-hud";
import type { LinterIssue } from "@technician/utils/logistics-linter";

/** Hits Apple HIG minimum touch target. Same as the avatar strip slot. */
const HUD_HEIGHT = 44;
/**
 * Visible distance from the chosen corner edge to the pill's outer
 * edge. PR-UX-11 (2026-05-09): the HUD is now draggable to any of
 * six anchor points (4 corners + top-center + bottom-center). The
 * `useDraggableHud` hook applies this inset on whichever edges the
 * active corner faces, so the pill sits the same distance from the
 * screen edge regardless of which corner the user has chosen.
 */
const HUD_EDGE_INSET = 8;
const BADGE_SIZE = 18;

interface InsetsOverride {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type WorstSeverity = "clean" | "warning" | "error";

function worstSeverityOf(issues: LinterIssue[]): WorstSeverity {
  let warning = false;
  for (const issue of issues) {
    if (issue.severity === "error") return "error";
    if (issue.severity === "warning") warning = true;
  }
  return warning ? "warning" : "clean";
}

const TINT_BY_SEVERITY: Record<WorstSeverity, string> = {
  clean: StatusColors.finalized,
  warning: StatusColors.scheduled,
  error: StatusColors.paymentDue,
};

const SEVERITY_LABEL: Record<WorstSeverity, string> = {
  clean: "no linter issues",
  warning: "warnings present",
  error: "errors present",
};

export interface PendingRealityHUDProps {
  /**
   * Test seam — production callers should leave this undefined and
   * let the component subscribe to `useAccessibilityStore.preferredHand`
   * directly. Tests pass an explicit value to avoid mocking the
   * store.
   */
  preferredHandOverride?: PreferredHand;
  /**
   * Test seam — production callers should leave this undefined and
   * let the component read `useSafeAreaInsets()` directly. Tests
   * pass an explicit value to avoid wrapping the harness in a
   * `SafeAreaProvider`.
   */
  safeAreaInsetsOverride?: InsetsOverride;
}

export function PendingRealityHUD({
  preferredHandOverride,
  safeAreaInsetsOverride,
}: PendingRealityHUDProps = {}) {
  const router = useRouter();
  const safeArea = useSafeAreaInsets();
  const insets = safeAreaInsetsOverride ?? safeArea;
  const storePreferredHand = useAccessibilityStore((s) => s.preferredHand);
  const preferredHand = preferredHandOverride ?? storePreferredHand;

  // Slice selectors — one per visible field. Subscribing to the
  // full store would re-render whenever the session row, status,
  // or sessionId changes, even if the count and tint did not move.
  const intentCount = usePendingRealityStore((s) => s.intents.length);
  const worstSeverity = usePendingRealityStore((s) =>
    worstSeverityOf(s.linterIssues),
  );

  const tint = TINT_BY_SEVERITY[worstSeverity];

  // Anchor on the edge OPPOSITE the avatar strip — same rule the
  // `MapToggleButton` follows. preferredHand=right → strip on the
  // right, both controls on the LEFT; preferredHand=left → mirror.
  // Single-sourced via `getOppositeEdge` so a future strip-side
  // policy change touches one definition.
  const edge = getOppositeEdge(preferredHand);

  const accessibilityLabel = useMemo(() => {
    const noun = intentCount === 1 ? "change" : "changes";
    return `Review ${intentCount} pending ${noun}; ${SEVERITY_LABEL[worstSeverity]}`;
  }, [intentCount, worstSeverity]);

  // PR-UX-11 (2026-05-09): wire up draggable HUD. Long-press 250ms
  // arms drag; release snaps to nearest of six positions (4 corners
  // + top-center + bottom-center). Persists across app launches via
  // AsyncStorage. The default corner is the chunk-prompt C.4 anchor
  // (top, opposite the avatar strip + below the map toggle); it gets
  // overridden by AsyncStorage on the next render after rehydration
  // completes. Tap (without long-press) still routes to the review
  // screen because RNGH gestures don't activate on quick taps and
  // the inner Pressable's `onPress` fires through the wrapper.
  const defaultCorner: HudCorner = edge === "left" ? "tl" : "tr";
  const draggable = useDraggableHud({
    defaultCorner,
    edgeInset: HUD_EDGE_INSET,
    storageKey: "@remi/landscape-hud-corner/pending-reality",
  });
  const {
    gesture: hudGesture,
    style: draggableStyle,
    isDragging,
    onLayout: onDraggableLayout,
    corner: activeCorner,
  } = draggable;

  // DEV trace — only fires when visibility-relevant inputs change.
  const lastTraceRef = useRef<string>("");
  useEffect(() => {
    if (!__DEV__) return;
    const visible = intentCount > 0;
    const key = `${intentCount}|${worstSeverity}|${edge}|${visible}|${activeCorner}|${isDragging}`;
    if (lastTraceRef.current === key) return;
    lastTraceRef.current = key;
    console.log("[DEBUG:HUD] visibility", {
      intentCount,
      worstSeverity,
      edge,
      preferredHand,
      visible,
      activeCorner,
      isDragging,
      hiddenReason: intentCount === 0 ? "no intents staged" : null,
    });
  }, [intentCount, worstSeverity, edge, preferredHand, activeCorner, isDragging]);

  if (intentCount === 0) return null;

  const onPress = () => {
    // Suppress tap dispatch when the user just released a drag. The
    // gesture's onEnd flips `isDragging` false synchronously, but the
    // Pressable can fire onPress on the same touch end frame.
    if (isDragging) return;
    if (__DEV__) {
      console.log("[DEBUG:HUD] tapped → routing to review", {
        intentCount,
        worstSeverity,
      });
    }
    haptic.light();
    router.push(PENDING_REALITY_REVIEW_ROUTE);
  };

  // PR-UX-11 (2026-05-09): wrap the draggable inner host in a
  // full-screen outer wrapper that absorbs the safe-area insets. The
  // hook owns the corner anchor (top/right/bottom/left + transform)
  // RELATIVE to the wrapper; the wrapper contributes the per-edge
  // safe-area padding so the pill always clears the notch / Dynamic
  // Island regardless of which corner the user has snapped to.
  // `pointerEvents="box-none"` on the wrapper lets touches outside
  // the inner host fall through to the calendar canvas underneath.
  return (
    <View
      style={{
        position: "absolute",
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
        zIndex: 110,
      }}
      pointerEvents="box-none"
    >
      {/* PR-UX-13 (2026-05-09) Issue A follow-on — the band wrapper
          is now a full-width strip on every corner (see
          `cornerAnchorStyle` in `useDraggableHud`). Without
          `pointerEvents="box-none"` here AND moving the
          GestureDetector inside, a long-press in the empty area to
          either side of the HUD pill would arm the drag at a
          position 100s of pt off-center from the visible pill,
          producing a "pill teleports to release point" surprise.
          The detector now only sees touches on the pill itself. */}
      <Animated.View
        style={[...draggableStyle, { zIndex: 110, height: HUD_HEIGHT }]}
        pointerEvents="box-none"
        testID="pending-reality-hud-host"
        accessibilityElementsHidden={false}
        onLayout={onDraggableLayout}
      >
        <GestureDetector gesture={hudGesture}>
          <View style={styles.pillContainer}>
            <Pressable
              accessibilityRole={"button" satisfies AccessibilityRole}
              accessibilityLabel={accessibilityLabel}
              onPress={onPress}
              hitSlop={6}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: tint },
                pressed && !isDragging && styles.pillPressed,
              ]}
              testID="pending-reality-hud"
            >
              <Text style={styles.glyph} accessible={false}>
                {/* Pencil-on-grid glyph stand-in — same character the FAB
                    uses (see `PendingRealityFAB.tsx`). Replaced once the
                    review screen ships its own iconography in P3-FE-4. */}
                ✎
              </Text>
              <Text style={styles.count} accessible={false} numberOfLines={1}>
                {intentCount > 99 ? "99+" : String(intentCount)}
              </Text>
            </Pressable>
            <View
              style={styles.badge}
              accessible={false}
              testID="pending-reality-hud-badge"
              pointerEvents="none"
            >
              <Text style={styles.badgeText} numberOfLines={1}>
                {intentCount > 9 ? "9+" : String(intentCount)}
              </Text>
            </View>
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // PR-UX-11 (2026-05-09): the legacy `host` static style was deleted —
  // `useDraggableHud` now owns the position-absolute + corner anchor +
  // transform style, threaded into the inner Animated.View via the
  // hook's `style` array. The pill below carries the visual chrome
  // (background tint, shadow, rounded corners) and its zIndex floats
  // above the calendar grid via `elevation` (Android) +
  // `shadowOpacity` (iOS).
  // PR-UX-13 (2026-05-09): badge sits absolute-positioned relative
  // to the HUD content, so the pill + badge live inside a positioned
  // container that the GestureDetector wraps. The container is
  // intentionally content-sized (no width/height set) — its bounds
  // define what the long-press gesture target captures.
  pillContainer: {
    position: "relative",
  },
  pill: {
    height: HUD_HEIGHT,
    minWidth: HUD_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: HUD_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  pillPressed: {
    opacity: 0.85,
  },
  glyph: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  count: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 17,
    minWidth: 14,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});
