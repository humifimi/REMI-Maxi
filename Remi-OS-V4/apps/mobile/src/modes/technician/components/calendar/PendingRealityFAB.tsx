/**
 * `PendingRealityFAB` — portrait-only floating action button that
 * surfaces the active Pending Reality session on the calendar tab
 * (P3-FE-2, master plan §5.2.1 / §5.3.4).
 *
 * Renders a 56pt circular button anchored to the bottom-right corner
 * (16pt margin) of the host. The badge in the top-right shows the
 * count of pending intents on the active session; the body tint
 * reflects the worst-severity local linter issue:
 *
 *   - clean (no linter issues)  → green  (#22C55E)
 *   - one or more warnings only → yellow (#EAB308)
 *   - one or more errors        → red    (#EF4444)
 *
 * All three colors come from `StatusColors` so the FAB stays in the
 * same color language as `SeverityBadge` (§5.2.4) and the universal
 * status palette (§1.2.7). No inline hex.
 *
 * Subscriptions use slice selectors so a session-row refresh (e.g.
 * `policy_snapshot` updates from a realtime ping) does NOT re-render
 * the FAB unless the count or severity actually changed. The
 * worst-severity slice is computed inside its own selector via a
 * one-pass scan; the cost is dominated by the existing render path.
 *
 * Visibility:
 *   - Portrait only. The landscape equivalent is the HUD
 *     (`P3-FE-3`).
 *   - Hidden when no intents have been staged yet. See the
 *     PLAN-DEVIATION note below for why we DON'T also surface the
 *     calendar's `pendingDraft` here.
 *
 * Tap → routes to `/pending-reality/review` (the dual-mode review
 * screen lands in `P3-FE-4`; until then the route resolves to a
 * placeholder that dumps the store state for debugging).
 */

// PLAN-DEVIATION: 2026-04-23-pending-reality-trim — the chunk-prompt
// step "Render only when `intents.length > 0` OR `heldDraft != null`"
// is implemented as `intents.length > 0` only. The `heldDraft` slice
// no longer exists on `usePendingRealityStore` (the rotation-
// resilience window was retired by 2026-04-21-rotation-sideways-draft;
// see `src/stores/pending-reality.ts`). The "preserve cognitive
// work" surface that replaced it lives on
// `useCalendarStore.pendingDraft` and is already painted on the
// calendar canvas as a dashed synthetic event by
// `useResourcesWithDraft` — surfacing it again behind a FAB would be
// duplicative chrome for state the user can already see, and
// conflating it with the Pending Reality session count would
// re-couple the two stores that the trim deliberately separated.
// See docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim.

import { useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
} from "react-native";
import { useRouter } from "expo-router";

import { StatusColors } from "@technician/constants/colors";
import { useAiSuggestionSessions } from "@technician/hooks/franchise/use-franchise-reorganizations";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useAuthStore } from "@/src/stores/auth";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { UserRole } from "@technician/types/enums";
import type { LinterIssue } from "@technician/utils/logistics-linter";
import { PENDING_REALITY_REVIEW_ROUTE } from "@technician/constants/pending-reality-routes";

/**
 * Re-exported for backwards compatibility — the canonical home is
 * `@technician/constants/pending-reality-routes`. New code should import from
 * there directly. This re-export avoids breaking the existing FAB
 * test + HUD imports until they are migrated in a follow-up pass.
 *
 * @deprecated import from `@technician/constants/pending-reality-routes` instead.
 */
export { PENDING_REALITY_REVIEW_ROUTE };

const FAB_SIZE = 56;
const FAB_MARGIN = 16;
const BADGE_SIZE = 22;

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

export function PendingRealityFAB() {
  const router = useRouter();
  const { orientation } = useWideCanvas();

  // Slice selectors — one per visible field. Subscribing to the full
  // store would re-render whenever the session row, status, or
  // sessionId changes, even if neither the badge count nor the tint
  // color moved.
  const intentCount = usePendingRealityStore((s) => s.intents.length);
  const worstSeverity = usePendingRealityStore((s) =>
    worstSeverityOf(s.linterIssues),
  );

  // D2P-FE-14 follow-up (2026-04-27): for franchise owners the FAB
  // is also the entry point to the AI tab on the review screen.
  // Without this, AI-emitted reorganization sessions persist on the
  // backend (visible to `useAiSuggestionSessions`) but the FO has
  // no surface anywhere on the calendar to navigate to them — they
  // get the "AI scan complete — open the AI tab" alert with no AI
  // tab in sight. The local Pending Reality store stays scoped to
  // the user's own staged intents (technicians and FOs both); the
  // backend-sourced AI count piggybacks on the same FAB only for
  // the role that's allowed to act on those sessions per §2.5.
  const userRole = useAuthStore((s) => s.user?.role ?? null);
  const isFranchiseOwner =
    userRole === UserRole.FRANCHISE_OWNER ||
    userRole === UserRole.FRANCHISOR;
  const aiSessionsQuery = useAiSuggestionSessions({
    enabled: isFranchiseOwner,
  });
  const aiSessionCount = isFranchiseOwner
    ? (aiSessionsQuery.data?.length ?? 0)
    : 0;
  const totalCount = intentCount + aiSessionCount;

  const tint = TINT_BY_SEVERITY[worstSeverity];

  const accessibilityLabel = useMemo(() => {
    const noun = totalCount === 1 ? "item" : "items";
    return `Review ${totalCount} pending ${noun}; ${SEVERITY_LABEL[worstSeverity]}`;
  }, [totalCount, worstSeverity]);

  // DEV trace — fires only when the visibility-relevant inputs
  // change (orientation, intent count, worst severity), not on
  // every render. Helps diagnose "why isn't the FAB showing?"
  // without spamming the console on each store mutation.
  const lastTraceRef = useRef<string>("");
  useEffect(() => {
    if (!__DEV__) return;
    const visible = orientation === "portrait" && totalCount > 0;
    const key = `${orientation}|${intentCount}|${aiSessionCount}|${worstSeverity}|${visible}`;
    if (lastTraceRef.current === key) return;
    lastTraceRef.current = key;
    console.log("[DEBUG:FAB] visibility", {
      orientation,
      intentCount,
      aiSessionCount,
      isFranchiseOwner,
      worstSeverity,
      visible,
      hiddenReason:
        orientation !== "portrait"
          ? "landscape (HUD owns this surface)"
          : totalCount === 0
            ? "no intents staged and no AI sessions pending"
            : null,
    });
  }, [
    orientation,
    intentCount,
    aiSessionCount,
    isFranchiseOwner,
    worstSeverity,
    totalCount,
  ]);

  // Hide in landscape (HUD owns this surface there per §5.3.4) and
  // when nothing is staged AND no AI sessions await FO review. See
  // PLAN-DEVIATION at the top of this file for why `pendingDraft`
  // is intentionally not part of the visibility check.
  if (orientation !== "portrait") return null;
  if (totalCount === 0) return null;

  const onPress = () => {
    if (__DEV__) {
      console.log("[DEBUG:FAB] tapped → routing to review", {
        intentCount,
        aiSessionCount,
        worstSeverity,
      });
    }
    haptic.light();
    router.push(PENDING_REALITY_REVIEW_ROUTE);
  };

  return (
    <View
      style={styles.host}
      pointerEvents="box-none"
      testID="pending-reality-fab-host"
    >
      <Pressable
        accessibilityRole={"button" satisfies AccessibilityRole}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: tint },
          pressed && styles.fabPressed,
        ]}
        testID="pending-reality-fab"
      >
        <Text style={styles.glyph} accessible={false}>
          {/* Pencil-on-grid glyph stand-in. `MaterialIcons` would also
              work, but a single character keeps this surface free of
              icon-font dependencies that the snapshot suite would
              have to mock. P3-FE-4 replaces this once the review
              screen lands and the FAB borrows its iconography. */}
          ✎
        </Text>
      </Pressable>
      <View
        style={styles.badge}
        accessible={false}
        testID="pending-reality-fab-badge"
        pointerEvents="none"
      >
        <Text style={styles.badgeText} numberOfLines={1}>
          {totalCount > 9 ? "9+" : String(totalCount)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: FAB_MARGIN,
    // Lift above the bottom tab bar (≈ 56pt). The host stays a
    // pure overlay — `pointerEvents="box-none"` on the wrapper means
    // taps outside the FAB itself fall through to whatever's beneath.
    bottom: FAB_MARGIN + 56,
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.85,
  },
  glyph: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 26,
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
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 13,
  },
});
