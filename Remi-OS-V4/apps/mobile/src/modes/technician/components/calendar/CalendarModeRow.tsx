/**
 * `CalendarModeRow` — the `Day | Week | Month` segmented control
 * with optional inline `[map]` / `[density]` toggles and trailing
 * `+` (new) and gear (settings) buttons.
 *
 * Extracted verbatim from `calendar-header.tsx`'s internal `modeRow`
 * (PR-UI-REDESIGN-1 modularization, 2026-05-12). Reads the current
 * `viewMode` and the `setViewMode` setter directly from
 * `useCalendarStore` to match the original's behavior — the segment
 * tabs are a global UI concern and every call site needs the same
 * source of truth.
 *
 * 2026-05-12 (PR-UI-REDESIGN-2): `showMapToggle` and
 * `showDensityToggle` props were added so the redesigned single-row
 * `<CalendarHeader>` can host the map + density icons that used to
 * live in the date-nav row. The icons are reused from the same
 * `useCalendarStore` slice the date-nav row read from (same
 * function, new position) so behavior stays identical.
 */

import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCalendarStore } from "@technician/stores/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CalendarDensity } from "@technician/constants/calendar";

const VIEW_MODES = [
  { key: "day" as const, label: "Day" },
  { key: "week" as const, label: "Week" },
  { key: "month" as const, label: "Month" },
];

const DENSITY_ICON: Record<CalendarDensity, string> = {
  none: "open-in-full",
  height: "unfold-less",
  width: "view-column",
  both: "compress",
};

export interface CalendarModeRowProps {
  /** Show the trailing `+` button. Calls `onNewPress` when tapped. */
  showNewButton?: boolean;
  /** Tap handler for the `+` button. Ignored when `showNewButton` is false. */
  onNewPress?: () => void;
  /**
   * Show the trailing gear icon next to the `+` button. Calls
   * `onSettingsPress` when tapped; opens the in-calendar Quick
   * Settings sheet at every existing call site.
   */
  showSettingsButton?: boolean;
  onSettingsPress?: () => void;
  /**
   * PR-UI-REDESIGN-2 (2026-05-12): inline the map ⇄ list toggle
   * between the mode tabs and the `+` / gear cluster. Same function
   * the date-nav row previously hosted — toggles
   * `useCalendarStore.showMap`.
   */
  showMapToggle?: boolean;
  /**
   * PR-UI-REDESIGN-2 (2026-05-12): inline the density-toggle next
   * to the map button. Same function the date-nav row previously
   * hosted — cycles `useCalendarStore.calendarDensity`.
   */
  showDensityToggle?: boolean;
}

export function CalendarModeRow({
  showNewButton = false,
  onNewPress,
  showSettingsButton = false,
  onSettingsPress,
  showMapToggle = false,
  showDensityToggle = false,
}: CalendarModeRowProps) {
  const viewMode = useCalendarStore((s) => s.viewMode);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const showMap = useCalendarStore((s) => s.showMap);
  const toggleMap = useCalendarStore((s) => s.toggleMap);
  const calendarDensity = useCalendarStore((s) => s.calendarDensity);
  const toggleDensity = useCalendarStore((s) => s.toggleDensity);

  return (
    <View style={styles.modeRow}>
      <View style={styles.modeTabs}>
        {VIEW_MODES.map((m) => (
          <Pressable
            key={m.key}
            style={[styles.modeBtn, viewMode === m.key && styles.modeBtnActive]}
            onPress={() => {
              haptic.light();
              setViewMode(m.key);
            }}
          >
            <Text
              style={[
                styles.modeText,
                viewMode === m.key && styles.modeTextActive,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {showMapToggle && (
        <Pressable
          style={[styles.iconBtn, showMap && styles.iconBtnActive]}
          onPress={() => {
            haptic.light();
            toggleMap();
          }}
        >
          <MaterialIcons
            name={showMap ? "view-list" : "map"}
            size={20}
            color={showMap ? "#fff" : "#3B82F6"}
          />
        </Pressable>
      )}

      {showDensityToggle && (
        <Pressable
          style={[
            styles.iconBtn,
            calendarDensity !== "none" && styles.iconBtnActive,
          ]}
          onPress={() => {
            haptic.light();
            toggleDensity();
          }}
        >
          <MaterialIcons
            name={DENSITY_ICON[calendarDensity] as never}
            size={20}
            color={calendarDensity !== "none" ? "#fff" : "#3B82F6"}
          />
        </Pressable>
      )}

      {showNewButton && (
        <Pressable
          style={styles.newBtn}
          onPress={() => {
            haptic.medium();
            onNewPress?.();
          }}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
        </Pressable>
      )}

      {showSettingsButton && (
        <Pressable
          style={styles.gearBtn}
          onPress={() => {
            haptic.light();
            onSettingsPress?.();
          }}
          accessibilityLabel="Calendar quick settings"
          hitSlop={6}
        >
          <MaterialIcons name="tune" size={20} color="#3B82F6" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  // Inner segmented-control group: the Day | Week | Month tabs
  // share the leftover horizontal space evenly, leaving the icons
  // and action buttons their natural width at the trailing edge.
  modeTabs: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  modeBtnActive: {
    backgroundColor: "#3B82F6",
  },
  modeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  modeTextActive: {
    color: "#fff",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  iconBtnActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
});
