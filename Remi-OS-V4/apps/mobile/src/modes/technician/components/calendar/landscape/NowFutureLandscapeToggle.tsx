/**
 * `<NowFutureLandscapeToggle />` — compact Now/Future toggle pill for
 * the landscape calendar.
 *
 * Landscape sibling of `<NowFutureToggle />` (portrait). The portrait
 * toggle is a full-width segmented control nested in
 * `MoveChainChipRow.bottomSlot`; landscape is a compact pill nested
 * in `MoveChainChipRow.chipClusterRightSlot`, anchored to the right
 * edge of the floating ecosystem popover on the same horizontal line
 * as the active chain's dot row. Reads + writes
 * `useCalendarStore.futureMode` so a flip in either orientation
 * propagates to the other on rotation.
 *
 * # Why this is needed (PR-UX-15, 2026-05-09)
 *
 * The original PR-UX-5 intentionally left landscape without a toggle.
 * The user hit the predicted complaint: futureMode toggled true in
 * portrait, then rotated to landscape, then staged a new intent —
 * landscape painted no cyan tile, no ghost, no chip bar, with no
 * way to flip futureMode off without rotating back to portrait.
 *
 * # 2026-05-10 follow-up — relocated into the chip-row popover
 *
 * PR-UX-15 originally mounted this as a corner-anchored
 * `position: absolute` pill stacked under MapToggleButton / above
 * PendingRealityHUD. The user's 2026-05-10 follow-up smoke pass
 * (paired with the portrait `bottomSlot` relocation in `b60fc64`)
 * asked for the landscape toggle to be nested inside the floating
 * `MoveChainChipRow` popover instead, on the same horizontal line
 * as the chain dot row. This removed the corner-anchoring concern
 * — the toggle now flows inline as the right-edge child of the
 * chip cluster row, so the absolute-positioning code path is gone.
 *
 * The component still self-gates on `intentCount > 0` so callers can
 * mount it unconditionally; when there's nothing to project it
 * returns `null` and the chip row's right slot collapses.
 */

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";

// 2026-05-10 follow-up: `EdgeInsets`, `useAccessibilityStore`, the
// `insets` / `preferredHandOverride` / `safeAreaInsetsOverride`
// props, and the `containerStyle` `useMemo` block were all part of
// the corner-anchored mount that this version retires. The toggle
// no longer reads safe-area or hand-preference state because its
// container — `MoveChainChipRow.chipClusterRightSlot` — flows in
// the chip row's normal layout. The empty `NowFutureLandscapeToggleProps`
// is kept as a typed-empty-shape so call sites can rely on a stable
// component identity if future props are added.
interface NowFutureLandscapeToggleProps {
  // Intentionally empty. Kept as a named interface so future props
  // (e.g., density override, color theming for non-popover mounts)
  // can be added without churning every call site.
}

export function NowFutureLandscapeToggle(_props: NowFutureLandscapeToggleProps = {}) {
  const futureMode = useCalendarStore((s) => s.futureMode);
  const setFutureMode = useCalendarStore((s) => s.setFutureMode);
  const intentCount = usePendingRealityStore((s) => s.intents.length);

  // Self-gated: only mount when there's something to project. When
  // intentCount drops to 0 the parent's `useEffect` already
  // force-clears futureMode (see `app/(tabs)/index.tsx`); this
  // component just hides the affordance.
  const visible = intentCount > 0;

  if (!visible) return null;

  const onToggle = () => {
    const next = !futureMode;
    if (__DEV__) {
      // 2026-05-10 follow-up — log every press with surrounding state
      // so a future regression of the "toggle disappeared" symptom is
      // observable from the press call site, not just the store
      // setter. Cheap (only fires on tap) and high signal.
      const pending = usePendingRealityStore.getState();
      console.log("[Calendar:NowFutureToggle] press", {
        next,
        orientation: "landscape",
        sessionId: pending.sessionId,
        intentCount,
      });
    }
    setFutureMode(next);
  };

  return (
    <View
      style={styles.container}
      testID="landscape-now-future-toggle"
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ selected: futureMode }}
        accessibilityLabel={
          futureMode ? "Switch to current calendar" : "Preview post-commit calendar"
        }
        style={({ pressed }) => [
          styles.pill,
          futureMode && styles.pillFuture,
          pressed && styles.pillPressed,
        ]}
        testID={
          futureMode
            ? "landscape-toggle-future-active"
            : "landscape-toggle-now-active"
        }
      >
        <MaterialIcons
          name={futureMode ? "visibility" : "visibility-off"}
          size={16}
          color={futureMode ? "#FFFFFF" : "#374151"}
        />
        <Text
          style={[styles.label, futureMode && styles.labelFuture]}
          numberOfLines={1}
        >
          {futureMode ? "Future" : "Now"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 2026-05-10 follow-up: `position: "absolute"` + `zIndex: 30`
  // dropped — the toggle now flows inline inside
  // `MoveChainChipRow.chipClusterRightSlot`, so it lives in the
  // chip row's normal layout tree. A bare `View` with no extra
  // styling is enough; the chip row's `chipClusterRightSlot` style
  // already handles flex-shrink + alignment for the slot.
  container: {},
  // 2026-05-10 follow-up: dropped the shadow + elevation. Inside the
  // chip row's translucent-white popover (`landscapeMoveChainStyles.pill`
  // background `rgba(255,255,255,0.96)`), the inner pill's drop
  // shadow stacked against the popover's own elevation and read as a
  // visual seam between the toggle and the chip cluster. The 1pt
  // border on the pill keeps the toggle visually distinct without
  // the shadow. paddingVertical 6 → 4 for a slightly tighter pill so
  // the toggle's height matches the chip cluster's chip pills (32pt
  // visual height) — a 16pt icon + 12pt label with the new vertical
  // padding clocks in at ~28pt, comfortable next to the chips.
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    // 2026-05-10 user fix #3: paddingVertical 4 → 2 and minHeight
    // 28 → 24 so the toggle pill clocks in at ~28pt — matching the
    // 32pt chips (32 - 2 × 2 padding context) instead of being
    // taller than them. The Row 1 height was being driven up to
    // 36pt by this single child, leaving an invisible inset
    // between the row baseline and the dot row. The tighter pill
    // brings Row 1 down to ~32pt, in line with the chip cluster.
    paddingVertical: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 24,
  },
  pillFuture: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E9",
  },
  pillPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 0.3,
  },
  labelFuture: {
    color: "#FFFFFF",
  },
});
