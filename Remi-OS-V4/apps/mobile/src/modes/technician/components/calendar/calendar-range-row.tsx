import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { formatTimeOfDay } from "@technician/utils/time-format";

/** Step size (minutes) for the chevron stepper. */
export const RANGE_STEP_MINUTES = 30;

interface CalendarRangeRowProps {
  label: string;
  minutes: number;
  /** Inclusive lower bound (minutes-from-midnight). */
  minBound: number;
  /** Inclusive upper bound (minutes-from-midnight). */
  maxBound: number;
  onChange: (next: number) => void;
}

/**
 * Read/write row with a label on the left and a `−  10:00 AM  +`
 * chevron stepper on the right. Used by the full Settings screen
 * (Calendar Display Hours, Shift / Availability) and the in-calendar
 * Quick Settings bottom sheet so the two surfaces stay visually and
 * behaviorally identical.
 *
 * Stepping is in 30-minute increments — coarse enough to stay snappy
 * with chevron taps, fine enough for shift definitions. Buttons
 * disable themselves at the bounds so an invalid range is impossible
 * from the UI alone (callers should still validate in their store).
 */
export function CalendarRangeRow({
  label,
  minutes,
  minBound,
  maxBound,
  onChange,
}: CalendarRangeRowProps) {
  const canDecrement = minutes - RANGE_STEP_MINUTES >= minBound;
  const canIncrement = minutes + RANGE_STEP_MINUTES <= maxBound;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => canDecrement && onChange(minutes - RANGE_STEP_MINUTES)}
          style={[styles.btn, !canDecrement && styles.btnDisabled]}
          hitSlop={6}
          disabled={!canDecrement}
          accessibilityLabel={`Decrease ${label.toLowerCase()} by 30 minutes`}
        >
          <MaterialIcons
            name="remove"
            size={18}
            color={canDecrement ? "#3B82F6" : "#D1D5DB"}
          />
        </Pressable>
        <Text style={styles.value}>{formatTimeOfDay(minutes)}</Text>
        <Pressable
          onPress={() => canIncrement && onChange(minutes + RANGE_STEP_MINUTES)}
          style={[styles.btn, !canIncrement && styles.btnDisabled]}
          hitSlop={6}
          disabled={!canIncrement}
          accessibilityLabel={`Increase ${label.toLowerCase()} by 30 minutes`}
        >
          <MaterialIcons
            name="add"
            size={18}
            color={canIncrement ? "#3B82F6" : "#D1D5DB"}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: "transparent",
  },
  value: {
    minWidth: 92,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
});
