/**
 * `ChainToChainConflictToast` (PR-UX-16, PLAN-DEVIATION
 * 2026-05-09-pr-ux-16-followups; PR-UX-19 dynamic positioning) —
 * informational popup that fires when two pending chain destinations
 * end up in the same calendar slot. Pairs with the
 * `auxHighlightedChainIds` store slice so both conflicting chains
 * paint their highlights / ghosts simultaneously for the toast
 * lifetime.
 *
 * User report (landscape, PR-UX-16):
 *
 *   "in the landscape screenshots, I put 2 card destinations in
 *    the same place, and it detects a conflict, but should
 *    probably do something like create a toast or popup telling
 *    the user that there is already an existing pending chain
 *    appointment that has been placed in that spot."
 *
 *   "It would also be useful if BOTH chains were then highlighted
 *    at the same time so the user can see the chain to chain
 *    conflict."
 *
 * Follow-up (PR-UX-19, 2026-05-09):
 *
 *   "There are other drawers that come up from the bottom of the
 *    screen, but instead only take up half of the calendar space
 *    depending on where the activity on the screen is, so it's
 *    relative to that and shows up on the opposite side of where
 *    the activity on the calendar is happening."
 *
 * The PR-UX-16 implementation rendered the conflict via the
 * top-anchored full-width `SwapToast`, which covered the very
 * chains the user had just landed in conflict — exactly the
 * failure mode the half-width detail-sheet pattern
 * (`AppointmentDetailSheet`, PLAN-DEVIATION
 * 2026-04-22-half-width-detail-sheet) exists to solve. PR-UX-19
 * mirrors that precedent: the popup pins to the half of the
 * calendar OPPOSITE the conflicting slot, leaving both highlighted
 * chains visible.
 *
 * Mechanism
 * ─────────
 * 1. `detectChainToChainDestinationConflicts(intents, appointments)`
 *    runs on every change to the local pending-reality store's
 *    intents (subscribed via `usePendingRealityStore.intents` +
 *    the linter appointment list from the local hook below). The
 *    detector returns a stable-sorted list of
 *    `{chainAId, chainBId, intentAId, intentBId, ...}` pairs.
 * 2. We dedupe on a per-pair key so the same conflict only shows
 *    one toast even if it persists across re-renders. Subsequent
 *    new pairs (e.g. user adds a third intent that conflicts with
 *    a fourth chain) trigger fresh toasts.
 * 3. While the toast is visible, `auxHighlightedChainIds` is set
 *    to `[chainAId, chainBId]`. The three calendar wrappers'
 *    `applyMoveChainBorderOverride` and `getVisibleMoveChainDestSlots`
 *    call sites read this set and render both chains' highlights /
 *    ghosts in their own colors.
 * 4. The active conflict's X coordinate on the calendar canvas is
 *    derived via the consumer-supplied `getConflictX` callback
 *    (parent owns view-mode geometry). `useDynamicPopupSide` maps
 *    that X to the opposite-side popup position.
 * 5. The popup slides in from the chosen side via Reanimated.
 *    Auto-dismisses after `TOAST_DISMISS_MS`. Tapping outside the
 *    popup also dismisses.
 * 6. On dismiss, `auxHighlightedChainIds` is cleared.
 *
 * Anti-instructions:
 *   - Don't use this toast as a blocking modal — it's informational.
 *     The user has already confirmed the destination via gesture;
 *     we just want them to know about the chain-to-chain overlap.
 *   - Don't widen `auxHighlightedChainIds` to include a third
 *     chain on subsequent overlaps without re-thinking the visual
 *     contract. Two chains coexist visually; three+ start to read
 *     as "Show all" and the user loses the "these two are
 *     conflicting" signal.
 *   - Don't re-emit the toast for the SAME pair across a single
 *     session. `seenPairKeysRef` is the dedupe surface; if the
 *     user explicitly re-stages an intent into the same pair,
 *     they'll see a fresh toast for the new intent ids in the
 *     pair (which produces a different key).
 *   - Don't revert to the `SwapToast` full-width banner. The
 *     covers-the-conflict bug the user reported on 2026-05-09 was
 *     a direct consequence of the full-width layout; rolling that
 *     back without re-engineering the visibility model would
 *     reintroduce the regression.
 *   - Don't bake view-mode-specific X math into this component.
 *     Keep it consumer-driven via `getConflictX` so the popup
 *     stays portable across portrait day, portrait week, and the
 *     landscape workweek canvas (and any future canvas).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDynamicPopupSide } from "@technician/hooks/ui/use-dynamic-popup-side";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import {
  detectChainToChainDestinationConflicts,
  type ChainToChainConflict,
} from "@technician/utils/detect-move-chains";
import type { LinterAppointment } from "@technician/utils/logistics-linter";

interface ChainToChainConflictToastProps {
  /**
   * Linter-shape appointment list (the same shape passed into
   * `useMoveChainGraph` from the calendar wrappers). Used as the
   * second argument to `detectChainToChainDestinationConflicts`.
   * Empty / undefined disables the detector entirely (no false
   * positives during cold-start / loading windows).
   */
  appointments: readonly LinterAppointment[] | undefined;
  /**
   * PR-UX-19 — given an active conflict and the current viewport
   * width, return the X coordinate (0 = left edge,
   * `viewportWidth` = right edge) of the conflicting slot on the
   * calendar canvas, or `null` when the consumer can't (yet)
   * resolve a position. Returning `null` falls the popup back to
   * the right-side default (still half-width, just no
   * opposite-side selection).
   *
   * The consumer owns the conflict→x mapping because the math
   * differs by view mode: landscape workweek uses the conflict's
   * `date` mapped against the workweek-start window; portrait day
   * uses the conflict's `technician_id` mapped against the visible
   * tech columns. Centralising that here would couple the toast to
   * the calendar layout and break the "this popup pattern is
   * reusable for the next drawer" requirement from the user
   * spec.
   */
  getConflictX?: (
    conflict: ChainToChainConflict,
    viewportWidth: number,
  ) => number | null;
}

const TOAST_DISMISS_MS = 6000;
const SLIDE_IN_MS = 280;
const SLIDE_OUT_MS = 220;
// 2026-05-10 user fix: card slides UP from below the wrapper, not
// in from the side. 320 covers the typical card height (icon +
// title + detail + CTA + paddings) plus margin so the card is
// fully off-screen at rest.
const SLIDE_OFFSCREEN_Y = 320;

export function ChainToChainConflictToast({
  appointments,
  getConflictX,
}: ChainToChainConflictToastProps) {
  const intents = usePendingRealityStore((s) => s.intents);
  const setAuxHighlightedChainIds = usePendingRealityStore(
    (s) => s.setAuxHighlightedChainIds,
  );

  // Dedupe key set — every conflict pair we've already shown a
  // toast for. Per-process; not persisted. Reset implicitly on
  // session change because the chain ids change.
  const seenPairKeysRef = useRef<Set<string>>(new Set());

  const [activeConflict, setActiveConflict] =
    useState<ChainToChainConflict | null>(null);

  // Recompute whenever intents or appointments change. Cheap when
  // intents.length < 2 or no overlaps.
  useEffect(() => {
    if (!appointments || appointments.length === 0) return;
    if (intents.length < 2) return;
    const conflicts = detectChainToChainDestinationConflicts(
      intents,
      appointments,
    );
    if (conflicts.length === 0) return;
    // Find the first conflict whose pair key we haven't already
    // shown. Pair key includes intent ids so re-staging into a new
    // intent in the same chain pair produces a fresh key.
    for (const c of conflicts) {
      const key = `${c.chainAId}::${c.chainBId}::${c.intentAId}::${c.intentBId}`;
      if (seenPairKeysRef.current.has(key)) continue;
      seenPairKeysRef.current.add(key);
      setActiveConflict(c);
      setAuxHighlightedChainIds([c.chainAId, c.chainBId]);
      if (__DEV__) {
        console.log("[ChainToChainConflict] surfaced", {
          pairKey: key,
          conflict: c,
        });
      }
      return;
    }
  }, [intents, appointments, setAuxHighlightedChainIds]);

  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Resolve the conflict's X coordinate on the calendar canvas via
  // the consumer-supplied callback. `null` (no callback, or
  // callback returned null) falls through to the hook's safe
  // default of right-side. Recomputed whenever the active conflict
  // OR the viewport width changes (e.g. a rotation while the
  // toast is up).
  const conflictX = useMemo(() => {
    if (!activeConflict) return null;
    if (!getConflictX) return null;
    const x = getConflictX(activeConflict, windowWidth);
    return typeof x === "number" && Number.isFinite(x) ? x : null;
  }, [activeConflict, getConflictX, windowWidth]);

  // 2026-05-10 user fix: `popupWidth` is no longer used (card uses
  // `translateY` instead of `translateX` for entry/exit), but the
  // hook still returns it for callers that need it. Pull only the
  // values we actually consume.
  const { side, wrapperStyle } = useDynamicPopupSide({
    conflictX,
    viewportWidth: windowWidth,
  });

  // Animation primitives. 2026-05-10 user fix: switched from
  // `translateX` (side-slide) to `translateY` (bottom-up slide).
  // The user reported the side-slide felt like a banner; they
  // want a drawer-style rise from the bottom of the screen,
  // matching the `AppointmentDetailSheet` half-width
  // BottomSheet feel. Off-screen rest = `SLIDE_OFFSCREEN_Y`,
  // visible = 0. `opacity` rides alongside so the entry / exit
  // feel like a proper drawer rather than a hard cut.
  const translateY = useSharedValue(SLIDE_OFFSCREEN_Y);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    setActiveConflict(null);
    setAuxHighlightedChainIds([]);
  }, [setAuxHighlightedChainIds]);

  // Drive the entry / exit animations off the conflict lifecycle.
  // 2026-05-10 user fix: card slides UP from below; `side` is kept
  // in the dep array so a rotation that flips the wrapper to the
  // other half re-asserts the at-rest position even if a dismiss
  // animation was mid-flight.
  useEffect(() => {
    if (activeConflict) {
      translateY.value = SLIDE_OFFSCREEN_Y;
      opacity.value = 0;
      translateY.value = withTiming(0, {
        duration: SLIDE_IN_MS,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: SLIDE_IN_MS });

      // Auto-dismiss timer. Cleared on early dismiss / unmount.
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        if (__DEV__) {
          console.log("[ChainToChainConflict] auto-dismiss");
        }
        onDismiss();
      }, TOAST_DISMISS_MS);
    } else {
      translateY.value = withTiming(SLIDE_OFFSCREEN_Y, {
        duration: SLIDE_OUT_MS,
        easing: Easing.in(Easing.cubic),
      });
      opacity.value = withTiming(0, { duration: SLIDE_OUT_MS });
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    }
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [activeConflict, side, opacity, translateY, onDismiss]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Tap-outside dismiss. Mirrors the precedent's
  // `enablePanDownToClose` affordance — the user can close the
  // popup without waiting for the timer or hunting for an X.
  // `Pressable.onPress` already fires on the JS thread, so we
  // don't need `runOnJS` here.
  const handleBackdropPress = useCallback(() => {
    if (__DEV__) {
      console.log("[ChainToChainConflict] tap-outside dismiss");
    }
    onDismiss();
  }, [onDismiss]);

  if (!activeConflict) return null;

  // When the consumer didn't (or couldn't) resolve a conflictX,
  // `wrapperStyle` is null. We still render — pinned to the
  // right-side default with a 50 % width — so the toast stays
  // useful even in views that don't supply geometry. Falling all
  // the way back to a centered overlay would defeat the
  // "informational, doesn't cover the chains" point of PR-UX-19.
  const fallbackWrapper: import("react-native").ViewStyle = {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: insets.right,
    width: Math.max(Math.round(windowWidth * 0.5) - insets.right, 200),
  };
  const resolvedWrapperStyle = wrapperStyle ?? fallbackWrapper;

  // 2026-05-10 user fix: card anchors to the BOTTOM of the
  // half-width wrapper and auto-sizes to its content. Previously
  // both `top` AND `bottom` were set, stretching the card to the
  // full screen height with content only at the top. The bottom
  // anchor + auto-size + slide-up-from-below animation matches the
  // AppointmentDetailSheet drawer feel the user asked for.
  const bottomInset = insets.bottom + 12;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Transparent full-bleed backdrop. `pointerEvents` is
          `box-none` on the parent so taps pass through to the
          calendar EXCEPT where this Pressable sits — it covers the
          half opposite the popup so a tap on the visible-chains
          half still hits calendar tiles. The popup itself
          intercepts taps via its own Pressable overlay. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss chain conflict notice"
        onPress={handleBackdropPress}
        style={[
          styles.backdrop,
          side === "left"
            ? { left: 0, right: undefined, width: "50%" }
            : { right: 0, left: undefined, width: "50%" },
        ]}
      />
      <View style={resolvedWrapperStyle} pointerEvents="box-none">
        <Animated.View
          accessibilityRole="alert"
          accessibilityLabel="Chain-to-chain conflict — both highlighted on the calendar"
          style={[
            styles.card,
            { bottom: bottomInset },
            cardStyle,
          ]}
        >
          <View style={styles.iconWrap}>
            <MaterialIcons name="warning-amber" size={22} color="#fff" />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>Pending chain conflict</Text>
            <Text style={styles.detail}>
              Two staged chains target the same slot — both highlighted on
              the calendar.
            </Text>
            <Pressable
              onPress={() => {
                if (__DEV__) {
                  console.log("[ChainToChainConflict] tap → Got it");
                }
                onDismiss();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={({ pressed }) => [
                styles.cta,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.ctaText}>Got it</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    // Transparent — its only purpose is the tap-to-dismiss zone
    // over the popup half. The opposite half stays interactive
    // (the parent View has `pointerEvents="box-none"`).
    backgroundColor: "transparent",
  },
  card: {
    position: "absolute",
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    // The card is anchored to the top of its half-screen wrapper
    // — `top` / `bottom` are set inline so the safe-area insets
    // are respected. We don't stretch the card to fill the
    // wrapper; it should feel like a card floating in the half,
    // not a sheet that owns the half.
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F59E0B",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  detail: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    lineHeight: 18,
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  ctaText: {
    color: "#FBBF24",
    fontSize: 13,
    fontWeight: "700",
  },
});
