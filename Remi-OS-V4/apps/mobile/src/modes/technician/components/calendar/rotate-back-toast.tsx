import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useRotateBackToastStore } from "@technician/stores/rotate-back-toast";
import { useWideCanvas } from "@technician/hooks/ui/use-wide-canvas";

/**
 * `RotateBackToast` — bottom-anchored nudge to rotate the phone
 * back to landscape after a sheet save.
 *
 * PR 2.4 (2026-04-24) — paired companion to the existing
 * `presentation="sideways"` rotation prompt that fires when the
 * user opens a form sheet from landscape. On submit success the
 * sheet calls `useRotateBackToastStore.getState().show()`. This
 * component renders the toast and self-dismisses after AUTO_DISMISS_MS,
 * on tap, or on the next portrait→landscape orientation flip
 * (whichever lands first).
 *
 * Mounted at the screen-root level — see `app/(tabs)/index.tsx`.
 * Renders nothing while invisible.
 */
const AUTO_DISMISS_MS = 5000;

export function RotateBackToast() {
  const visible = useRotateBackToastStore((s) => s.visible);
  const hide = useRotateBackToastStore((s) => s.hide);
  const { orientation } = useWideCanvas();

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      hide();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, hide]);

  // Goal-met dismiss: when the user actually rotates back to
  // landscape, the toast's purpose is fulfilled, so hide it.
  useEffect(() => {
    if (!visible) return;
    if (orientation === "landscape") {
      hide();
    }
  }, [visible, orientation, hide]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      pointerEvents="box-none"
      style={styles.wrapper}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rotate phone back to landscape"
        onPress={hide}
        style={styles.toast}
      >
        <View style={styles.iconWrap}>
          <MaterialIcons name="screen-rotation" size={20} color="#1D4ED8" />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Rotate to landscape</Text>
          <Text style={styles.subtitle}>Return to your calendar view</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    minWidth: 240,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
  subtitle: { fontSize: 12, color: "#3B82F6", marginTop: 2 },
});
