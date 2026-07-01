/**
 * `PendingRealityDevShortcut` — small grey "DEV ✎" pill anchored
 * above the bottom tab bar that opens `/pending-reality/review`.
 *
 * Why this exists:
 *   The Pending Reality FAB (`PendingRealityFAB`) only renders once
 *   `usePendingRealityStore.intents.length > 0`. The producer that's
 *   supposed to populate intents under real interaction
 *   (`useSessionAwareSubmit` → `LinterInterceptSheet` → "Stage for
 *   review") only fires when the local linter returns issues — and
 *   today `useCalendarWorldSnapshot` returns `EMPTY_WORLD_SNAPSHOT`,
 *   so the linter always returns `[]`, the intercept sheet never
 *   opens, and the FAB never lights up under real drags or form
 *   submits. See the "Future-agent action items" at the bottom of the
 *   `P3-FE-7` entry in `docs/DEVELOPMENT-LOG.md`.
 *
 *   Until the real `useCalendarWorldSnapshot` lands, the only way to
 *   exercise the FAB / HUD / review-screen pipeline on a device is
 *   the `__DEV__` seed buttons that live on the empty state of
 *   `/pending-reality/review`. This shortcut gives the user a
 *   one-tap path to that screen without typing a deep link.
 *
 * Stripped from production bundles by the `if (!__DEV__) return null;`
 * short-circuit (same pattern the seed buttons themselves use). No
 * route guard needed; the screen self-handles role gating.
 *
 * D2P-FE-14 — additionally gated behind
 * `useDemoSettingsStore.devShortcutVisible`, defaulting to `false`
 * so the dev pill doesn't clutter the review screen for FOs running
 * a real demo. The toggle lives in Settings → Demo Mode and only
 * has an effect inside `__DEV__` (the `__DEV__` short-circuit below
 * makes the toggle a no-op on a production EAS build). See
 * `docs/implementation-plans/pending-reality-demo-bundle.md` §6.1.4.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PENDING_REALITY_REVIEW_ROUTE } from "@technician/constants/pending-reality-routes";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useDemoSettingsStore } from "@technician/stores/demo-settings";

export function PendingRealityDevShortcut() {
  const router = useRouter();
  const visible = useDemoSettingsStore((s) => s.devShortcutVisible);

  if (!__DEV__) return null;
  if (!visible) return null;

  const onPress = () => {
    if (__DEV__) {
      console.log("[DEBUG:DevShortcut] tap → routing to review");
    }
    haptic.light();
    router.push(PENDING_REALITY_REVIEW_ROUTE);
  };

  return (
    <View
      style={styles.host}
      pointerEvents="box-none"
      testID="pending-reality-dev-shortcut-host"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="DEV: open Pending Reality review screen"
        onPress={onPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        testID="pending-reality-dev-shortcut"
        hitSlop={8}
      >
        <Text style={styles.text}>DEV ✎ Review</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    bottom: 16 + 56,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#374151",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  pillPressed: {
    opacity: 0.85,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
