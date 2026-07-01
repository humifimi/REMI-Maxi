import { forwardRef, useMemo } from "react";
import { StyleSheet, View, Text, Pressable, Switch, Alert } from "react-native";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import {
  useCalendarStore,
  DEFAULT_DISPLAY_START_MINUTES,
  DEFAULT_DISPLAY_END_MINUTES,
  MIN_DISPLAY_RANGE_MINUTES,
} from "@technician/stores/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { CalendarRangeRow } from "./calendar-range-row";
import { formatRangeSummary } from "@technician/utils/time-format";

interface CalendarQuickSettingsSheetProps {
  onClose: () => void;
}

/**
 * Shared confirmation prompt before turning Fit-to-events OFF. Strict
 * mode silently hides / clips events that fall outside the saved
 * Day Starts / Day Ends bounds, which is easy to overlook — surface the
 * trade-off explicitly and let the user back out before committing.
 *
 * Re-exported so the full Settings screen can use the exact same copy
 * without duplicating it.
 */
export function confirmStrictMode(onConfirm: () => void) {
  Alert.alert(
    "Switch to Strict mode?",
    "Appointments and personal events that fall outside Day Starts or Day Ends will be hidden or clipped — you may not see early or late jobs.\n\nYou can switch Fit to events back on anytime.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Use Strict mode", style: "destructive", onPress: onConfirm },
    ],
  );
}

/**
 * In-calendar shortcut for the handful of settings that change the
 * shape of the calendar itself (right now: visible day range). Lives
 * behind the gear icon on the franchise & technician calendar
 * toolbars so users can tighten the range mid-flow without leaving
 * the screen they're working on.
 *
 * Mutations write through `useCalendarStore` exactly like the full
 * Settings screen, so changes persist across launches and reflect
 * immediately in both day and week views (the visible range is
 * derived state, not duplicated state).
 *
 * Anything not a "while you're scheduling" decision (notifications,
 * sounds, theme, zone, shift hours, etc.) belongs in the full
 * Settings screen — the "More in Settings →" link below the controls
 * deep-links there for power users.
 */
export const CalendarQuickSettingsSheet = forwardRef<
  AppSheetRef,
  CalendarQuickSettingsSheetProps
>(function CalendarQuickSettingsSheet({ onClose }, ref) {
  const router = useRouter();
  // LDM-WAVE-2 CHUNK-2 (SHEETS-1): preserved as portrait snap points;
  // landscape half-width uses AppSheet's [60%,95%] defaults.
  const snapPoints = useMemo(() => ["48%"], []);

  const displayStartMinutes = useCalendarStore((s) => s.displayStartMinutes);
  const displayEndMinutes = useCalendarStore((s) => s.displayEndMinutes);
  const setDisplayRange = useCalendarStore((s) => s.setDisplayRange);
  const resetDisplayRange = useCalendarStore((s) => s.resetDisplayRange);
  const displayAutoExpand = useCalendarStore((s) => s.displayAutoExpand);
  const setDisplayAutoExpand = useCalendarStore((s) => s.setDisplayAutoExpand);

  const isCustomized =
    displayStartMinutes !== DEFAULT_DISPLAY_START_MINUTES ||
    displayEndMinutes !== DEFAULT_DISPLAY_END_MINUTES;

  return (
    <AppSheet
      ref={ref}
      defaultSide="right"
      defaultSnapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <MaterialIcons name="tune" size={20} color="#3B82F6" />
          <Text style={styles.title}>Quick Settings</Text>
        </View>

        <Text style={styles.sectionLabel}>Calendar Display Hours</Text>

        <View style={styles.card}>
          <CalendarRangeRow
            label="Day Starts"
            minutes={displayStartMinutes}
            minBound={0}
            maxBound={displayEndMinutes - MIN_DISPLAY_RANGE_MINUTES}
            onChange={(next) => {
              haptic.light();
              setDisplayRange(next, displayEndMinutes);
              // Touching a stepper means "I want these bounds to take
              // effect" — flip out of fit-to-events mode automatically.
              if (displayAutoExpand) setDisplayAutoExpand(false);
            }}
          />
          <View style={styles.divider} />
          <CalendarRangeRow
            label="Day Ends"
            minutes={displayEndMinutes}
            minBound={displayStartMinutes + MIN_DISPLAY_RANGE_MINUTES}
            maxBound={1440}
            onChange={(next) => {
              haptic.light();
              setDisplayRange(displayStartMinutes, next);
              if (displayAutoExpand) setDisplayAutoExpand(false);
            }}
          />
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              {formatRangeSummary(displayStartMinutes, displayEndMinutes)}
            </Text>
            {isCustomized && (
              <Pressable
                onPress={() => {
                  haptic.light();
                  resetDisplayRange();
                }}
                hitSlop={8}
              >
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Text style={styles.toggleLabel}>Fit to events</Text>
              <Text style={styles.toggleSub}>
                {displayAutoExpand
                  ? "Calendar caps to first & last event"
                  : "Use Day Starts / Day Ends bounds"}
              </Text>
            </View>
            <Switch
              value={displayAutoExpand}
              onValueChange={(next) => {
                haptic.light();
                if (!next) {
                  confirmStrictMode(() => setDisplayAutoExpand(false));
                } else {
                  setDisplayAutoExpand(true);
                }
              }}
              trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
            />
          </View>
        </View>

        {displayAutoExpand ? (
          <Text style={styles.note}>
            Calendar fits exactly to your events. Falls back to the bounds above on empty days. Adjusting the bounds switches off Fit to events.
          </Text>
        ) : (
          <View style={styles.warningNote}>
            <MaterialIcons name="warning-amber" size={16} color="#B45309" />
            <Text style={styles.warningNoteText}>
              Strict mode is on. Events that start before Day Starts or end after Day Ends will be hidden or clipped at the edge of the grid.
            </Text>
          </View>
        )}

        <Pressable
          style={styles.moreLink}
          onPress={() => {
            haptic.light();
            onClose();
            // Allow the sheet to begin closing before route push so the
            // back stack stays clean.
            setTimeout(() => router.push("/settings"), 220);
          }}
        >
          <Text style={styles.moreLinkText}>More in Settings</Text>
          <MaterialIcons name="chevron-right" size={20} color="#3B82F6" />
        </Pressable>
      </BottomSheetView>
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: "#F9FAFB",
  },
  sheetHandle: {
    backgroundColor: "#D1D5DB",
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  resetText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  toggleLabelGroup: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  toggleSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
    marginTop: 10,
    marginHorizontal: 4,
  },
  warningNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warningNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#92400E",
    fontWeight: "500",
  },
  moreLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  moreLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
});
