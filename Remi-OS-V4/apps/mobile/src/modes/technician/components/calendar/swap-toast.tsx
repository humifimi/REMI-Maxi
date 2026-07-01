import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface SwapToastProps {
  visible: boolean;
  /**
   * Headline text — caller composes the wording (e.g. "Moved to Marcus").
   * The toast itself stays generic.
   */
  message: string;
  /**
   * Supporting line — optional, e.g. "9:30 AM • Brake service".
   */
  detail?: string;
  /** Fired when the user taps "Undo". */
  onUndo: () => void;
  /**
   * Fired when the user taps "Edit". Optional — when omitted the
   * Edit pill is hidden and only Undo is rendered (legacy behaviour).
   *
   * Wiring contract (P2-FE-6 follow-on, 2026-04-22): the consumer
   * opens the `RescheduleSheet` for the just-committed appointment.
   * The toast dismisses itself automatically after the callback
   * runs so the sheet doesn't stack on top of an active toast.
   */
  onEdit?: () => void;
  /** Fired after auto-dismiss timeout OR after Undo / Edit / swipe is tapped. */
  onDismiss: () => void;
  /** ms before auto-dismiss. Defaults to 5s per spec. */
  autoDismissMs?: number;
}

// Swipe-to-dismiss thresholds — picked by feel:
// SWIPE_DISTANCE: ~60pt is a comfortable wrist-flick on a 11" iPad
// SWIPE_VELOCITY: 600 px/s is "thrown" not "slid", so a slow read-then-slide
//   doesn't trigger early dismissal mid-glance.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 600;
// Hidden-state offsets used by the slide-out animations. Up dismiss
// flies the toast off the top edge; horizontal dismisses fly it off
// the matching side. Each is a multiple of the toast's expected
// height/width (~80pt / 700pt) so the toast clears the viewport.
const HIDDEN_Y = -160;
const HIDDEN_X = 800;

export function SwapToast({
  visible,
  message,
  detail,
  onUndo,
  onEdit,
  onDismiss,
  autoDismissMs = 5000,
}: SwapToastProps) {
  const insets = useSafeAreaInsets();
  // Toast slides DOWN from above the top edge on entry (P2-FE-6
  // follow-on, 2026-04-22 — moved from bottom to top per user
  // feedback "the bottom gets kind of crowded"). Initial offset is
  // negative so the toast is above the viewport on first paint.
  const translateY = useSharedValue(HIDDEN_Y);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable JS-thread dismiss (worklet-safe via runOnJS). Cancels the
  // auto-dismiss timer so a swipe doesn't race a pending timeout.
  const triggerDismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (visible) {
      if (__DEV__) {
        console.log("[DEBUG:Toast/Swap] shown", {
          message,
          detail: detail ?? null,
          hasEditButton: !!onEdit,
          autoDismissMs,
        });
      }
      opacity.value = withTiming(1, { duration: 180 });
      // Slight overshoot below the resting position then settle —
      // gives the entry a soft "drop in" feel rather than a hard
      // stop. Same easing curve the bottom-anchored variant used.
      translateY.value = withSequence(
        withTiming(8, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
      );
      translateX.value = withTiming(0, { duration: 0 });
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        if (__DEV__) {
          console.log("[DEBUG:Toast/Swap] auto-dismiss timeout", {
            message,
            elapsedMs: autoDismissMs,
          });
        }
        onDismiss();
      }, autoDismissMs);
    } else {
      if (__DEV__) {
        console.log("[DEBUG:Toast/Swap] hidden");
      }
      opacity.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(HIDDEN_Y, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      });
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
  }, [visible, autoDismissMs, onDismiss, opacity, translateY, translateX]);

  // Pan gesture: track finger live, then on release decide commit-or-snap-back.
  // Direction priority: vertical-up > horizontal — swiping down does NOT
  // dismiss (would conflict with the user's natural "pull down to refresh"
  // muscle memory and with sheet-dismiss gestures). Swiping the toast
  // sideways flies it off the matching edge.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((evt) => {
          "worklet";
          translateY.value = Math.min(0, evt.translationY); // clamp downward
          translateX.value = evt.translationX;
        })
        .onEnd((evt) => {
          "worklet";
          const swipedUp =
            evt.translationY < -SWIPE_DISTANCE ||
            evt.velocityY < -SWIPE_VELOCITY;
          const swipedSide =
            Math.abs(evt.translationX) > SWIPE_DISTANCE ||
            Math.abs(evt.velocityX) > SWIPE_VELOCITY;

          if (swipedUp) {
            translateY.value = withTiming(HIDDEN_Y, {
              duration: 180,
              easing: Easing.in(Easing.cubic),
            });
            opacity.value = withTiming(0, { duration: 160 });
            runOnJS(triggerDismiss)();
            return;
          }
          if (swipedSide) {
            const dir = evt.translationX > 0 ? 1 : -1;
            translateX.value = withTiming(dir * HIDDEN_X, {
              duration: 220,
              easing: Easing.in(Easing.cubic),
            });
            opacity.value = withTiming(0, { duration: 180 });
            runOnJS(triggerDismiss)();
            return;
          }
          // Snap back — neither threshold met.
          translateY.value = withTiming(0, { duration: 180 });
          translateX.value = withTiming(0, { duration: 180 });
        }),
    [opacity, translateX, translateY, triggerDismiss],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
  }));

  const wrapStyle = useMemo(
    () => [styles.wrap, { top: insets.top + 12 }],
    [insets.top],
  );

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="box-none" style={wrapStyle}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.toast, animatedStyle]}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="swap-horiz" size={20} color="#fff" />
          </View>
          <View style={styles.text}>
            <Text style={styles.message} numberOfLines={1}>
              {message}
            </Text>
            {detail ? (
              <Text style={styles.detail} numberOfLines={1}>
                {detail}
              </Text>
            ) : null}
          </View>
          {onEdit ? (
            <Pressable
              onPress={() => {
                if (__DEV__) {
                  console.log('[DEBUG:Toast/Swap] tap → "Edit"', { message });
                }
                onEdit();
                onDismiss();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit appointment details"
              style={({ pressed }) => [
                styles.editBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (__DEV__) {
                console.log('[DEBUG:Toast/Swap] tap → "Undo"', { message });
              }
              onUndo();
              onDismiss();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.undoBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    // `top` is set inline from `insets.top + 12` so the toast clears
    // the status bar / Dynamic Island in both orientations.
    left: 16,
    right: 16,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    // P2-FE-5 chunk 2c follow-up (2026-04-22): mirrored from
    // EventQuickActionToast (260/480 → 520/960 → 390/720 → 422/780
    // → 380/702) so both toasts stay in sync.
    minWidth: 380,
    maxWidth: 702,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  detail: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    // Subtle ghost-pill style — same shape as Undo but outlined in
    // white-ish at lower contrast so Undo remains the primary action.
    // Edit is the escape hatch, not the primary call to action.
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  editText: {
    color: "#F3F4F6",
    fontSize: 13,
    fontWeight: "600",
  },
  undoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(59, 130, 246, 0.18)",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  undoText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "700",
  },
});
