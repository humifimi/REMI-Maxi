/**
 * `TechNameFlashOverlay` (PR-UX-3 Phase 2 — 2026-05-07).
 *
 * 600ms tech-name flash banner that fires when the side-arrow widget
 * remounts the workweek calendar onto a different technician. Fade
 * in 200ms → hold 200ms → fade out 200ms. Hard cut on the
 * underlying calendar (no slide, no crossfade); the banner is the
 * sole visual cue for the tech change.
 *
 * Spec: `pr-ux-3-multi-tech-handoff.md` §1.N3 + §2 Phase 2.
 *
 * Design notes:
 *   - `pointerEvents: "none"` so the banner never absorbs taps.
 *     The remount happens regardless; the banner is purely
 *     informational.
 *   - The banner is positioned absolutely at the TOP of its parent
 *     view. The workweek view's `<View style={styles.calendarWrapper}>`
 *     is the closest positioning ancestor; the wrapper already hosts
 *     the `MoveChainArrowOverlay` and the actual `<Calendar>`.
 *   - `flashKey` is the React key for the inner Animated.View. Each
 *     bump of the key from the side-arrow tech-mount hook restarts
 *     the animation cleanly (Reanimated doesn't fire `withTiming`
 *     on a re-render unless the SharedValue actually changes; the
 *     key swap is the cheapest way to "reset" the lifecycle and
 *     replay the 600ms cycle).
 *   - The banner stays mounted at all times — only the inner
 *     animated layer remounts on key change. Keeping the wrapper
 *     mounted means the parent's layout box doesn't reflow when
 *     the flash fires.
 */

import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const FADE_IN_MS = 200;
const HOLD_MS = 200;
const FADE_OUT_MS = 200;

export interface TechNameFlashOverlayProps {
  /**
   * Banner copy. Typically `Now viewing ${techName}` or just the
   * tech name itself, decided by the caller. Defaults to `null`
   * which renders nothing.
   */
  techName: string | null;
  /**
   * Animation seed. Bump this when a new flash should fire — the
   * inner Animated.View remounts on key change and replays the
   * 200/200/200 envelope. Typically incremented by
   * `useSideArrowTechMount` on every tech-remount.
   */
  flashKey: number;
  /** Optional testID forwarded to the outer wrapper. */
  testID?: string;
}

/**
 * Internal animated banner. Kept as a separate component so the
 * `flashKey` prop on the outer wrapper can drive React-key remount
 * without re-running the outer wrapper's effect bookkeeping.
 */
const FlashBanner = memo(function FlashBanner({
  techName,
}: {
  techName: string;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Hard-cut envelope: fade in → hold → fade out. Reanimated
    // queues the sequence on the UI thread so the JS thread never
    // sees the in-flight values — avoids stutter when the user
    // rapidly mashes the side arrow (each press just stomps the
    // SV with a fresh sequence).
    opacity.value = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: FADE_IN_MS }),
      withDelay(HOLD_MS, withTiming(0, { duration: FADE_OUT_MS })),
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.banner, animatedStyle]}
      pointerEvents="none"
      testID="tech-name-flash-banner"
    >
      <Text style={styles.bannerText} numberOfLines={1}>
        {`Now viewing ${techName}`}
      </Text>
    </Animated.View>
  );
});

export const TechNameFlashOverlay = memo(function TechNameFlashOverlay({
  techName,
  flashKey,
  testID,
}: TechNameFlashOverlayProps) {
  if (techName == null || techName.length === 0) {
    // Nothing to flash — return null so the wrapper's positioning
    // doesn't reserve space for an invisible banner.
    return null;
  }

  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      testID={testID ?? "tech-name-flash-overlay"}
    >
      {/* Inner Animated.View is keyed by `flashKey` so each remount
          replays the envelope cleanly. */}
      <FlashBanner key={flashKey} techName={techName} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 8,
    // Sits ABOVE the arrow overlay (which has its own `top:
    // bodyTopOffset`); the wrap is z-stacked above by virtue of
    // mount order in the parent.
  },
  banner: {
    backgroundColor: "rgba(17, 24, 39, 0.85)", // #111827 @ 85%
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
