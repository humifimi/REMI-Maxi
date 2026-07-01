/**
 * `CrossCardCollisionToast` — transient "your apply-anyway just
 * put a pending move into conflict with the live calendar" notice.
 *
 * PLAN-DEVIATION: 2026-05-12-pending-move-overlap-soft-framing —
 * paired companion to the linter intercept sheet's softer
 * pending-move framing. See
 * docs/PLAN-DEVIATIONS.md#2026-05-12-pending-move-overlap-soft-framing.
 *
 * UX
 * ──
 * Mounted at the calendar tab level. Fires when
 * `useSessionAwareSubmit` resolves an apply-anyway live-commit
 * that left a still-pending intent in conflict with the committed
 * world. The toast is informational, not blocking — it surfaces
 * the consequence and offers a one-tap "Adjust pending" route to
 * the pending-reality review screen. Auto-dismisses after
 * AUTO_DISMISS_MS.
 *
 * Visual: amber-bordered card with an info icon, a two-line body
 * (committed-card lead-in + one line per conflicting intent), and
 * two actions. Bottom-anchored, full-width on portrait, half-width
 * on landscape (mirrors `CleanIntentPromotionToast` pattern but
 * intentionally simpler — no snooze, no progress bar, no
 * post-action confirmation).
 *
 * Why not the half-width pinned-popup pattern from the
 * intercept sheet?
 *   The cross-card collision is INFORMATIONAL — the user already
 *   took the action that caused it. A center-pinned banner is the
 *   right surface for "btw, here's a consequence." The intercept
 *   sheet's half-width pinned popup is for a DECISION POINT (block
 *   the user mid-drop until they choose Apply / Stage), which this
 *   isn't.
 */

import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCrossCardCollisionToastStore } from "@technician/stores/cross-card-collision-toast";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";

const AUTO_DISMISS_MS = 7000;

export function CrossCardCollisionToast() {
  const info = useCrossCardCollisionToastStore((s) => s.info);
  const dismiss = useCrossCardCollisionToastStore((s) => s.dismiss);
  const router = useRouter();
  const { orientation } = useWideCanvas();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Auto-dismiss timer. One timer per active info reference.
  useEffect(() => {
    if (!info) return;
    const timer = setTimeout(() => {
      if (__DEV__) {
        console.log("[CAL:crossCardCollisionToast] auto-dismiss");
      }
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [info, dismiss]);

  if (!info) return null;

  const handleAdjust = () => {
    if (__DEV__) console.log("[CAL:crossCardCollisionToast] tap → Adjust pending");
    dismiss();
    router.push("/pending-reality/review");
  };

  const handleDismiss = () => {
    if (__DEV__) console.log("[CAL:crossCardCollisionToast] tap → Dismiss");
    dismiss();
  };

  // Landscape: half-width centered so it doesn't cover the canvas
  // hand-zone the user is still operating on. Portrait: full-width
  // bottom drawer with safe-area inset.
  const wrapperStyle =
    orientation === "landscape"
      ? {
          ...styles.wrapper,
          left: undefined as number | undefined,
          right: insets.right + 12,
          width: Math.max(Math.round(windowWidth * 0.5) - insets.right - 24, 280),
        }
      : {
          ...styles.wrapper,
          left: 12,
          right: 12,
          bottom: styles.wrapper.bottom + insets.bottom,
        };

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      pointerEvents="box-none"
      style={wrapperStyle}
      testID="cross-card-collision-toast"
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="info-outline" size={22} color="#B45309" />
        </View>
        <View style={styles.body}>
          <Text style={styles.eyebrow} accessibilityRole="text">
            Heads up — pending move now in conflict
          </Text>
          <Text style={styles.headline} testID="cross-card-collision-toast-headline">
            {info.committedLabel}.
          </Text>
          {info.entries.map((entry) => (
            <Text
              key={entry.intentId}
              style={styles.detail}
              testID={`cross-card-collision-toast-entry-${entry.intentId}`}
            >
              • {entry.label} now overlaps this commit.
            </Text>
          ))}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adjust pending move"
              onPress={handleAdjust}
              testID="cross-card-collision-toast-adjust"
              style={({ pressed }) => [
                styles.btnPrimary,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={styles.btnPrimaryText}>Adjust pending</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={handleDismiss}
              testID="cross-card-collision-toast-dismiss"
              style={({ pressed }) => [
                styles.btnGhost,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={styles.btnGhostText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 24,
    alignItems: "stretch",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 14,
    backgroundColor: "#FFFBEB", // amber-50
    borderWidth: 1,
    borderColor: "#FCD34D", // amber-300
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF3C7", // amber-100
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: "#B45309", // amber-700
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  headline: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  detail: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    marginTop: 10,
    gap: 8,
    alignItems: "center",
  },
  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#B45309",
  },
  btnPrimaryText: {
    color: "#FFFBEB",
    fontSize: 13,
    fontWeight: "700",
  },
  btnGhost: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnGhostText: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "600",
  },
  btnPressed: { opacity: 0.7 },
});
