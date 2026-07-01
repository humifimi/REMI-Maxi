/**
 * `CalendarDateNavRow` — the `< MMM D – MMM D, YYYY >` row with
 * optional map + density toggle icons on the right.
 *
 * Extracted verbatim from `calendar-header.tsx`'s internal `dateRow`
 * (PR-UI-REDESIGN-1 modularization, 2026-05-12). Reads directly from
 * `useCalendarStore` for the same reason the original did — every
 * piece of state it touches (selectedDate, viewMode, showMap,
 * calendarDensity, plus the nav setters) is a global UI concern,
 * not a per-call-site value. Keeping the store reads here means
 * call sites can mount the row anywhere without re-plumbing the
 * date label.
 *
 * The visible date label format mirrors the original component
 * exactly:
 *   - week: "MMM D – MMM D, YYYY" (Monday → Sunday, where Sunday is
 *     `monday + 6` regardless of locale)
 *   - month: "MMMM YYYY"
 *   - day: "ddd, MMM D, YYYY"
 *
 * Tapping the date label fires `goToToday`. The chevrons fire
 * `goToPreviousDay`/`Week` (or `goToNextDay`/`Week`) based on
 * `viewMode`.
 *
 * PR-UI-REDESIGN-2 (follow-up) will consolidate this row INTO the
 * mode row (Day/Week/Month tabs + icons share one strip). Keeping
 * this as a standalone module so that follow-up can compose
 * differently — landscape uses the row alone, portrait redesigns
 * may merge it with the mode row.
 */

import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import dayjs from "dayjs";
import { useCalendarStore } from "@technician/stores/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type { CalendarDensity } from "@technician/constants/calendar";

const DENSITY_ICON: Record<CalendarDensity, string> = {
  none: "open-in-full",
  height: "unfold-less",
  width: "view-column",
  both: "compress",
};

export interface CalendarDateNavRowProps {
  /** Show the map ⇄ list toggle button to the right of the date arrows. */
  showMapToggle?: boolean;
  /** Show the density-toggle button (column / height / both / none). */
  showDensityToggle?: boolean;
}

export function CalendarDateNavRow({
  showMapToggle = false,
  showDensityToggle = false,
}: CalendarDateNavRowProps) {
  const {
    viewMode,
    selectedDate,
    showMap,
    calendarDensity,
    goToNextDay,
    goToPreviousDay,
    goToNextWeek,
    goToPreviousWeek,
    goToToday,
    toggleMap,
    toggleDensity,
  } = useCalendarStore();

  const displayDate = dayjs(selectedDate);
  const dow = displayDate.day();
  const monday =
    dow === 0 ? displayDate.subtract(6, "day") : displayDate.subtract(dow - 1, "day");
  const dateLabel =
    viewMode === "week"
      ? `${monday.format("MMM D")} – ${monday.add(6, "day").format("MMM D, YYYY")}`
      : viewMode === "month"
        ? displayDate.format("MMMM YYYY")
        : displayDate.format("ddd, MMM D, YYYY");

  const goBack = viewMode === "week" ? goToPreviousWeek : goToPreviousDay;
  const goForward = viewMode === "week" ? goToNextWeek : goToNextDay;

  return (
    <View style={styles.dateRow}>
      <Pressable
        style={styles.navBtn}
        onPress={() => {
          haptic.light();
          goBack();
        }}
        hitSlop={8}
      >
        <MaterialIcons name="chevron-left" size={24} color="#374151" />
      </Pressable>

      <Pressable onPress={goToToday}>
        <Text style={styles.dateText}>{dateLabel}</Text>
      </Pressable>

      <Pressable
        style={styles.navBtn}
        onPress={() => {
          haptic.light();
          goForward();
        }}
        hitSlop={8}
      >
        <MaterialIcons name="chevron-right" size={24} color="#374151" />
      </Pressable>

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
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 8,
  },
  navBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
    marginLeft: 8,
  },
  iconBtnActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
});
