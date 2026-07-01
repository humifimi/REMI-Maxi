/**
 * `<NowFutureToggle />` — segmented control for switching the
 * calendar canvas between the live world (Now) and the projected
 * post-commit world (Future). Mounted inside `<MoveChainChipRow>`'s
 * Row 1 inline-right slot (via `chipRowBottomSlot` → `bottomSlot`)
 * by both `<ResourceCalendarDayView>` and
 * `<ResourceCalendarWorkweekView>`. Gated on `intents.length > 0`
 * at the consumer so it never appears when there's nothing to
 * project.
 *
 * Reads `futureMode` from `useCalendarStore` and writes through
 * `setFutureMode`.
 *
 * 2026-05-12 (PR-UI-REDESIGN-2 follow-up): the previous full-width
 * "bar" presentation — white-vs-blue tinted background, hairline
 * bottom border, accompanying "PREVIEW · N off-screen" caption —
 * was designed for the toggle's earlier mount point (a sibling
 * row above the calendar canvas). Now that the toggle lives
 * inline next to Show none / Show all chips inside the chip row's
 * white pill, that chrome read as an awkward mismatched container
 * around the pill. Stripped to JUST the segmented pill — no
 * surrounding background, no border, no caption. The Future-mode
 * affordance is preserved entirely inside the active segment (blue
 * pill with white "Future" label).
 *
 * PR-UX-5 (2026-05-08).
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";

// 2026-05-10 follow-up — at the moment of press, log the surrounding
// state so we can correlate every futureMode flip with what was on
// screen. Cheap (only fires on tap) and high signal: catches both the
// "toggle disappeared then reappeared" Bug 2 case AND any future
// regression where the press fires but the store update misses.
function logTogglePress(
  next: boolean,
  orientation: "portrait" | "landscape",
) {
  if (!__DEV__) return;
  const pending = usePendingRealityStore.getState();
  console.log("[Calendar:NowFutureToggle] press", {
    next,
    orientation,
    sessionId: pending.sessionId,
    intentCount: pending.intents.length,
  });
}

export function NowFutureToggle() {
  const futureMode = useCalendarStore((s) => s.futureMode);
  const setFutureMode = useCalendarStore((s) => s.setFutureMode);

  return (
    <View style={styles.segmented} testID="calendar-now-future-toggle">
      <Pressable
        onPress={() => {
          logTogglePress(false, "portrait");
          setFutureMode(false);
        }}
        style={({ pressed }) => [
          styles.segment,
          !futureMode && styles.segmentActive,
          pressed && styles.segmentPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: !futureMode }}
        accessibilityLabel="Show current calendar"
        testID="calendar-toggle-now"
      >
        <Text
          style={[styles.segmentText, !futureMode && styles.segmentTextActive]}
        >
          Now
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          logTogglePress(true, "portrait");
          setFutureMode(true);
        }}
        style={({ pressed }) => [
          styles.segment,
          futureMode && styles.segmentActiveFuture,
          pressed && styles.segmentPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: futureMode }}
        accessibilityLabel="Preview post-commit calendar"
        testID="calendar-toggle-future"
      >
        <MaterialIcons
          name="visibility"
          size={14}
          color={futureMode ? "#FFFFFF" : "#6B7280"}
          style={styles.segmentIcon}
        />
        <Text
          style={[styles.segmentText, futureMode && styles.segmentTextFuture]}
        >
          Future
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 2026-05-12 (PR-UI-REDESIGN-2 follow-up): `segmented` is now the
  // component's outer container — the old `bar` wrapper (with its
  // white-vs-blue background tint and hairline border) was dropped
  // when the toggle moved inline into the chip row's white pill.
  // Background `#F3F4F6` matches the previous inner segmented-pill
  // appearance so the visual pill the user "doesn't want changed"
  // is unchanged from before.
  segmented: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    padding: 2,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minHeight: 28,
  },
  segmentActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 1,
    elevation: 1,
  },
  segmentActiveFuture: {
    backgroundColor: "#0EA5E9",
  },
  segmentPressed: {
    opacity: 0.75,
  },
  segmentIcon: {
    marginRight: 4,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  segmentTextActive: {
    color: "#111827",
  },
  segmentTextFuture: {
    color: "#FFFFFF",
  },
});
