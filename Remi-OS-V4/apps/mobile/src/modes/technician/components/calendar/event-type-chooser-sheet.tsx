import { forwardRef, useMemo } from "react";
import { StyleSheet, View, Text } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { AppSheet, type AppSheetRef } from "@technician/components/sheets";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { haptic } from "@technician/hooks/utility/use-haptics";

export type EventChoice = "customer" | "personal";

interface EventTypeChooserSheetProps {
  /**
   * Optional: pretty version of the time the user long-pressed at,
   * surfaced under the title so they remember WHERE they're creating.
   * E.g. "Thu, Apr 16 · 10:30 AM" or "Today · 2:00 PM".
   */
  contextLabel?: string;
  onChoose: (choice: EventChoice) => void;
  onClose: () => void;
}

/**
 * Two-option chooser shown after a long-press → release on an empty
 * cell. Lets the user split the create-event path into either a
 * Customer Appointment (full booking flow) or a Personal Event
 * (block off time). Used by both franchise & technician calendars.
 *
 * The chooser is intentionally tiny (one card, two big rows). Picking
 * an option calls `onChoose(choice)` and is expected to close this
 * sheet then lazy-mount the appropriate form sheet — see callers in
 * `app/(tabs)/index.tsx`.
 */
export const EventTypeChooserSheet = forwardRef<
  AppSheetRef,
  EventTypeChooserSheetProps
>(function EventTypeChooserSheet({ contextLabel, onChoose, onClose }, ref) {
  // LDM-WAVE-2 CHUNK-2 (SHEETS-1): portrait snap points preserved;
  // landscape half-width uses AppSheet's [60%,95%] defaults.
  const snapPoints = useMemo(() => ["32%"], []);

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
          <Text style={styles.title}>What are you scheduling?</Text>
          {contextLabel ? (
            <Text style={styles.contextLabel}>{contextLabel}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <ChoiceRow
            icon="event-available"
            iconColor="#3B82F6"
            iconBg="#DBEAFE"
            title="Customer appointment"
            subtitle="Book a job for a customer"
            onPress={() => {
              haptic.light();
              onChoose("customer");
            }}
          />
          <View style={styles.divider} />
          <ChoiceRow
            icon="event-busy"
            iconColor="#7C3AED"
            iconBg="#EDE9FE"
            title="Personal event"
            subtitle="Block off time on your calendar"
            onPress={() => {
              haptic.light();
              onChoose("personal");
            }}
          />
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onClose}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </AppSheet>
  );
});

interface ChoiceRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function ChoiceRow({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  onPress,
}: ChoiceRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.row}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

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
    paddingVertical: 8,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  contextLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 60,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3B82F6",
  },
});
