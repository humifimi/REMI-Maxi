/**
 * EventQuickActionToast
 * ---------------------
 * P2-FE-5 chunk 2c (2026-04-22): bottom-anchored quick-action toast
 * that appears when the user **long-presses a real event** (chunk 2b
 * routed long-press into a free, exclusive gesture for this purpose;
 * see `docs/PLAN-DEVIATIONS.md#2026-04-22-double-tap-drag`). It gives
 * the user a faster path to "kill this appointment" than opening the
 * full detail sheet just to reach the Cancel button.
 *
 * Visual model: cloned from `SwapToast` per the user's call ("there
 * is an undo popup that kinda does nothing really, but it looks
 * good. find that and use it as a module template"). Same dark pill,
 * same slide-up animation, same auto-dismiss, same accent-colored
 * action pill on the right — only the icon, copy, and pill behavior
 * differ. Keeping the visuals identical means the calendar's
 * long-press affordance and quick-swap undo affordance feel like
 * one toast family.
 *
 * v1 ships **Cancel-only** (single action pill). The chunk 2c
 * dev-log entry captures the iteration plan for adding more rows
 * (Edit, Quicktext) once the gesture is verified on-device.
 *
 * Mutual exclusion with `SwapToast`: both anchor at `bottom: 24` and
 * would collide visually if both were open at once. The consuming
 * surface (`app/(tabs)/index.tsx`) is responsible for clearing one
 * when opening the other — this component does not enforce it.
 */
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

/**
 * Action pill rendered on the right side of the toast. The pill copy
 * and behavior change per event kind:
 * - real appointment → "Cancel appt" → routes into CancelSheet
 * - personal event   → "Delete"      → routes into useDeletePersonalEvent
 *
 * The icon on the left also varies (`event-busy` vs `delete`) so the
 * user can tell at a glance which kind of event the toast is for.
 */
export interface QuickActionConfig {
  /** Pill copy (e.g. "Cancel appt", "Delete"). */
  label: string;
  /** Screen-reader label (e.g. "Cancel appointment", "Delete event"). */
  accessibilityLabel: string;
  /** MaterialIcons name for the left icon. */
  icon: string;
  /** Fired when the user taps the pill. */
  onPress: () => void;
}

interface EventQuickActionToastProps {
  visible: boolean;
  /** Headline — caller composes ("John Smith — 9:30 AM"). */
  message: string;
  /** Supporting line — optional ("Brake service"). */
  detail?: string;
  /** Primary action pill config (rightmost, accent-colored). Required.
   *  Per event kind: appointment → "Cancel appt", personalEvent → "Delete". */
  action: QuickActionConfig;
  /**
   * PR 2.6 (2026-04-24) — optional secondary action pills rendered
   * BEFORE the primary `action` pill. Used to surface common
   * non-destructive actions ("Edit", "Quicktext") at long-press
   * without forcing the user to open the full detail sheet first.
   *
   * Visual treatment: smaller icon-only pills (no text label) so
   * three pills still fit in portrait. Tooltips/aria are provided
   * by `accessibilityLabel`. The pill background uses the toast's
   * neutral white tint instead of the accent color so the primary
   * destructive pill remains visually dominant.
   */
  secondaryActions?: QuickActionConfig[];
  /** Fired after auto-dismiss timeout, after the pill is tapped, or
   *  after the consumer clears state externally. */
  onDismiss: () => void;
  /** ms before auto-dismiss. Default 5000 to match SwapToast. */
  autoDismissMs?: number;
}

export function EventQuickActionToast({
  visible,
  message,
  detail,
  action,
  secondaryActions,
  onDismiss,
  autoDismissMs = 5000,
}: EventQuickActionToastProps) {
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      if (__DEV__) {
        console.log("[DEBUG:Toast/QuickAction] shown", {
          message,
          detail: detail ?? null,
          actionLabel: action.label,
          actionIcon: action.icon,
          autoDismissMs,
        });
      }
      opacity.value = withTiming(1, { duration: 180 });
      translateY.value = withSequence(
        withTiming(-8, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
      );
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        if (__DEV__) {
          console.log("[DEBUG:Toast/QuickAction] auto-dismiss timeout", {
            message,
            elapsedMs: autoDismissMs,
          });
        }
        onDismiss();
      }, autoDismissMs);
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(120, { duration: 220, easing: Easing.in(Easing.cubic) });
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    }
    // visibility-toggle "hidden" trace lands intentionally outside
    // the if/else above so it only fires when visible flipped to
    // false (the if branch above already logged "shown"). React
    // re-runs this effect when visible changes; the deps array
    // includes it.
    if (__DEV__ && !visible) {
      console.log("[DEBUG:Toast/QuickAction] hidden");
    }
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [visible, autoDismissMs, onDismiss, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, animatedStyle]}>
      <View style={styles.toast}>
        <View style={styles.iconWrap}>
          <MaterialIcons name={action.icon as any} size={20} color="#fff" />
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
        {secondaryActions && secondaryActions.length > 0 ? (
          <View style={styles.secondaryRow}>
            {secondaryActions.map((sec) => (
              <Pressable
                key={sec.label}
                onPress={() => {
                  if (__DEV__) {
                    console.log(
                      `[DEBUG:Toast/QuickAction] tap → secondary "${sec.label}"`,
                      {
                        message,
                        accessibilityLabel: sec.accessibilityLabel,
                      },
                    );
                  }
                  sec.onPress();
                  onDismiss();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={sec.accessibilityLabel}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <MaterialIcons name={sec.icon as any} size={18} color="#E5E7EB" />
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            if (__DEV__) {
              console.log(`[DEBUG:Toast/QuickAction] tap → "${action.label}"`, {
                message,
                accessibilityLabel: action.accessibilityLabel,
              });
            }
            action.onPress();
            onDismiss();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          style={({ pressed }) => [
            styles.cancelBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.cancelText}>{action.label}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 24,
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
    // P2-FE-5 chunk 2c follow-up (2026-04-22): width tuning history:
    //   260/480  → original
    //   520/960  → "twice as long so the words show up"
    //   390/720  → "25% narrower" (overshot)
    //   422/780  → "undo 25% of what you did" (restored a quarter of
    //              the pull-in)
    //   380/702  → "10% narrower" (continued the narrowing trend —
    //              previous step that briefly went 422→464 was a
    //              misread of "more" as "more width" instead of
    //              "more narrowing")
    // Outer wrap still caps at screen-width − 32 (left/right: 16),
    // so portrait fills the available width naturally; the maxWidth
    // only matters in landscape. Mirrored on `SwapToast` for parity.
    minWidth: 380,
    maxWidth: 702,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    // Red accent (vs SwapToast's blue) so the destructive intent is
    // unambiguous — same visual family, different semantic color.
    backgroundColor: "#DC2626",
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
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(220, 38, 38, 0.18)",
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  cancelText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
  },
  // PR 2.6 (2026-04-24) — secondary icon-only pills.
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secondaryBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
});
